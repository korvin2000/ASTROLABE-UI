import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore, readPrefs, writePrefs } from '../../state/app.store';
import { Icon } from '../../ui/icon';

interface Entry { id: string; label: string; hint: string; icon: string; run: () => void; group: string; }

/** Command palette (§20.1): fuzzy search over actions, navigation and entities by id. */
@Component({
  selector: 'as-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="scrim" (click)="close.emit()"></div>
    <div class="box" role="dialog" aria-label="Command palette">
      <div class="q">
        <as-icon name="search" [size]="16" />
        <input #input class="grow" [value]="query()" (input)="query.set($any($event.target).value); index.set(0)"
          (keydown)="key($event)" placeholder="Search campaigns, projects, actions, ids (W-…, R1, AC-2)…" aria-label="Search" />
        <kbd>Esc</kbd>
      </div>
      <div class="list scroll" role="listbox">
        @for (e of results(); track e.id; let i = $index) {
          <button class="item" [class.on]="i === index()" role="option" [attr.aria-selected]="i === index()" (mouseenter)="index.set(i)" (click)="pick(e)">
            <as-icon [name]="e.icon" [size]="15" />
            <span class="lbl ellipsis">{{ e.label }}</span>
            <span class="grow"></span>
            <span class="hint ellipsis">{{ e.hint }}</span>
          </button>
        } @empty { <div class="empty">Nothing matches “{{ query() }}”.</div> }
      </div>
    </div>`,
  styles: [`
    :host{position:fixed;inset:0;z-index:60;display:flex;justify-content:center;align-items:flex-start;padding-top:12vh}
    .scrim{position:absolute;inset:0;background:rgba(0,0,0,.35)}
    .box{position:relative;width:min(640px,92vw);background:var(--bg-raised);border:1px solid var(--border-default);border-radius:var(--r-drawer);box-shadow:var(--shadow-overlay);overflow:hidden}
    .q{display:flex;align-items:center;gap:10px;padding:0 14px;height:48px;border-bottom:1px solid var(--border-subtle);color:var(--text-tertiary)}
    .q input{border:0;background:transparent;outline:none;font-size:14px;color:var(--text-primary)}
    .list{max-height:52vh;padding:6px}
    .item{display:flex;align-items:center;gap:10px;width:100%;height:34px;padding:0 10px;border:0;border-radius:6px;background:none;cursor:pointer;color:var(--text-secondary);text-align:left}
    .item.on{background:var(--bg-active);color:var(--text-primary)}
    .lbl{max-width:60%}
    .hint{font-size:11.5px;color:var(--text-tertiary);max-width:40%}
  `],
})
export class Palette implements AfterViewInit {
  private readonly app = inject(AppStore);
  private readonly router = inject(Router);
  readonly close = output<void>();
  readonly query = signal('');
  readonly index = signal(0);
  readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  private readonly entries = computed<Entry[]>(() => {
    const go = (url: any[]) => () => this.router.navigate(url);
    const e: Entry[] = [
      { id: 'a-new', label: 'New campaign', hint: 'Alt+N', icon: 'plus', group: 'action', run: go(['/new']) },
      { id: 'a-inbox', label: 'Needs you — pending decisions', hint: this.app.pendingDecisions().length + ' pending', icon: 'flag', group: 'nav', run: go(['/inbox']) },
      { id: 'a-activity', label: 'Activity', hint: 'processes, provider calls', icon: 'activity', group: 'nav', run: go(['/activity']) },
      { id: 'a-stats', label: 'Statistics', hint: 'spend, routing, interventions', icon: 'chart', group: 'nav', run: go(['/stats']) },
      { id: 'a-settings', label: 'Settings', hint: 'autonomy, budgets, roles…', icon: 'settings', group: 'nav', run: go(['/settings']) },
      { id: 'a-providers', label: 'Providers & models', hint: 'connect, test, profiles', icon: 'plug', group: 'nav', run: go(['/providers']) },
      { id: 'a-knowledge', label: 'Knowledge', hint: 'notes and admission queue', icon: 'book', group: 'nav', run: go(['/knowledge']) },
      { id: 'a-diag', label: 'Diagnostics', hint: 'versions, counters', icon: 'cpu', group: 'nav', run: go(['/diagnostics']) },
      { id: 'a-theme', label: 'Toggle theme', hint: 'dark / light', icon: 'moon', group: 'action', run: () => {
        const p = readPrefs();
        const cur = document.documentElement.getAttribute('data-theme');
        writePrefs({ ...p, theme: cur === 'light' ? 'dark' : 'light' });
      } },
    ];
    for (const p of this.app.projects()) e.push({ id: 'p-' + p.id, label: p.name, hint: p.path, icon: 'folder', group: 'project', run: go(['/p', p.id]) });
    for (const c of this.app.campaigns()) {
      e.push({ id: 'c-' + c.workId, label: c.title ?? c.workId, hint: c.workId + ' · ' + c.displayStatus.replace(/_/g, ' '), icon: 'target', group: 'campaign', run: go(['/p', c.projectId, 'c', c.workId]) });
      for (const tab of ['overview', 'plan', 'changes', 'evidence', 'context']) {
        e.push({ id: `c-${c.workId}-${tab}`, label: `${tab[0].toUpperCase() + tab.slice(1)} · ${c.title ?? c.workId}`, hint: c.workId, icon: 'chevron-right', group: 'tab', run: go(['/p', c.projectId, 'c', c.workId, tab]) });
      }
    }
    return e;
  });

  readonly results = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.entries();
    if (!q) return all.filter(e => e.group !== 'tab').slice(0, 30);
    const scored = all.map(e => ({ e, s: score(q, (e.label + ' ' + e.hint).toLowerCase()) })).filter(x => x.s > 0);
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 40).map(x => x.e);
  });

  ngAfterViewInit(): void { setTimeout(() => this.input()?.nativeElement.focus()); }

  key(ev: KeyboardEvent): void {
    const n = this.results().length;
    if (ev.key === 'ArrowDown') { this.index.set((this.index() + 1) % Math.max(1, n)); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { this.index.set((this.index() - 1 + n) % Math.max(1, n)); ev.preventDefault(); }
    else if (ev.key === 'Enter') { const e = this.results()[this.index()]; if (e) this.pick(e); ev.preventDefault(); }
    else if (ev.key === 'Escape') { this.close.emit(); ev.preventDefault(); }
  }

  pick(e: Entry): void {
    this.close.emit();
    e.run();
  }
}

function score(q: string, text: string): number {
  if (text.includes(q)) return 100 - text.indexOf(q);
  let i = 0, hits = 0;
  for (const ch of text) if (ch === q[i]) { i++; hits++; if (i === q.length) break; }
  return i === q.length ? 10 + hits : 0;
}
