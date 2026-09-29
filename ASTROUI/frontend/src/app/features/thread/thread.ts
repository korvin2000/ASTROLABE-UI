import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { CampaignStore } from '../../state/campaign.store';
import { AppStore } from '../../state/app.store';
import { CampaignSummary } from '../../core/model';
import { Block } from '../../reducers/campaign-model';
import { CellSection } from './cell-section';
import { DecisionCard } from '../decisions/decision-card';
import { FinishCard } from './finish-card';
import { Icon } from '../../ui/icon';
import { MarkdownPipe } from '../../ui/markdown';
import { clock, dateTime } from '../../core/format';

type Filter = 'all' | 'conversation' | 'tools' | 'checks' | 'decisions' | 'problems';

/**
 * The Thread (§6): the chronological, readable record of one campaign — derived from the stream, ordered, durable,
 * never edited. Requests and amendments are authority bubbles; cells hold turns; decisions appear where they were
 * requested; the finish card closes it. No auto-scroll while the user reads above (§6.6).
 */
@Component({
  selector: 'as-thread-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CellSection, DecisionCard, FinishCard, Icon, MarkdownPipe],
  template: `
    <div class="toolbar">
      <div class="seg">
        @for (f of filters; track f.key) { <button [class.on]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}</button> }
      </div>
      <span class="grow"></span>
      <input class="input search" placeholder="Search loaded items (Ctrl+F)" [value]="query()" (input)="query.set($any($event.target).value)" aria-label="Search the thread" />
    </div>
    <div class="scroll body" #scroller (scroll)="onScroll()">
      <div class="inner">
        @if (!store().loaded()) { <div class="dim pad">Loading the campaign stream…</div> }
        <div class="bubble user">
          <div class="who"><span class="avatar">U1</span><b>You</b><span class="dim">{{ time(firstAt()) }}</span><span class="grow"></span><span class="chip mono">contract v1</span></div>
          <div class="prose markdown" [innerHTML]="firstRequest() | markdown"></div>
        </div>
        @for (b of visible(); track b.id) {
          @switch (b.type) {
            @case ('boundary') {
              <div class="boundary" [class]="$any(b).tone" [title]="$any(b).detail ?? ''">
                <span class="rule"></span>
                <span class="btext">{{ $any(b).text }}</span>
                @if ($any(b).detail) { <button class="btn ghost sm icon" (click)="toggleDetail(b.id)" title="Details"><as-icon name="info" [size]="13" /></button> }
                <span class="rule"></span>
              </div>
              @if (openDetail() === b.id) { <pre class="detail mono">{{ $any(b).detail }}</pre> }
            }
            @case ('request') {
              <div class="bubble" [class.user]="$any(b).by === 'user'">
                <div class="who"><span class="avatar">{{ $any(b).by === 'user' ? 'U' : 'C' }}</span><b>{{ $any(b).by === 'user' ? 'You · amendment' : 'Contract amended by ' + $any(b).by }}</b>
                  <span class="dim">{{ time($any(b).at) }}</span><span class="grow"></span><span class="chip mono">contract v{{ $any(b).version }}</span></div>
                @if (requestText($any(b).version); as t) { <div class="prose markdown" [innerHTML]="t | markdown"></div> }
              </div>
            }
            @case ('cell') {
              @if (store().model.cells.get($any(b).cell); as c) {
                <as-cell-section [cell]="c" [store]="store()" [version]="store().version()" />
              }
            }
            @case ('decision') {
              @if (decision($any(b).decisionId); as d) { <as-decision-card [decision]="d" [compact]="d.status !== 'pending'" /> }
            }
            @case ('policy') {
              <div class="policy mono"><as-icon name="shield" [size]="12" /> policy · {{ $any(b).decision.kind }} · {{ policyLine($any(b).decision) }}</div>
            }
            @case ('warning') {
              <div class="warning"><as-icon name="alert" [size]="13" /> <b>{{ $any(b).kind }}</b> {{ $any(b).text }}</div>
            }
            @case ('finish') { <as-finish-card [store]="store()" [outcome]="$any(b).outcome" [reason]="$any(b).reason" [latest]="b.id === lastFinishId()" /> }
          }
        }
        @if (summary()?.live && !activeTurn()) { <div class="waiting dim"><span class="spin"></span> waiting for the next event…</div> }
        <div class="tail"></div>
      </div>
    </div>
    @if (unseen() > 0) {
      <button class="pill" (click)="toLive()"><as-icon name="chevron-down" [size]="14" /> {{ unseen() }} new · Live</button>
    }`,
  styles: [`
    :host{display:flex;flex-direction:column;flex:1;min-height:0;position:relative}
    .toolbar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border-subtle);flex:none}
    .search{width:260px;height:26px}
    .body{flex:1}
    .inner{max-width:1120px;margin:0 auto;padding:14px 20px 40px}
    .pad{padding:20px}
    .bubble{border:1px solid var(--border-subtle);border-radius:8px;padding:10px 14px;margin:8px 0;background:var(--bg-surface);max-width:900px}
    .bubble.user{border-left:2px solid var(--accent)}
    .who{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12.5px}
    .avatar{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:10.5px;font-weight:600;background:var(--accent-subtle);color:var(--accent);font-family:var(--font-mono)}
    .boundary{display:flex;align-items:center;gap:10px;margin:10px 0;color:var(--text-tertiary);font-size:12px}
    .boundary .rule{flex:1;height:1px;background:var(--border-subtle)}
    .boundary .btext{max-width:80%;text-align:center}
    .boundary.ok{color:var(--success)} .boundary.bad{color:var(--danger)} .boundary.warn{color:var(--attention)}
    .detail{margin:-4px 0 8px;padding:8px 10px;background:var(--code-bg);border:1px solid var(--border-subtle);border-radius:6px;font-size:11.5px;color:var(--text-secondary)}
    .policy{font-size:12px;color:var(--text-tertiary);padding:4px 10px;display:flex;align-items:center;gap:6px}
    .warning{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--attention);padding:4px 10px}
    .waiting{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px}
    .spin{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:p 1.4s ease-in-out infinite}
    @keyframes p{0%,100%{opacity:1}50%{opacity:.25}}
    .tail{height:1px}
    .pill{position:absolute;left:50%;transform:translateX(-50%);bottom:14px;display:flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:14px;
      border:1px solid var(--border-strong);background:var(--bg-raised);color:var(--text-primary);box-shadow:var(--shadow-overlay);cursor:pointer;font-size:12px}
  `],
})
export class ThreadTab implements AfterViewChecked {
  readonly store = input.required<CampaignStore>();
  readonly summary = input<CampaignSummary | null>(null);
  private readonly app = inject(AppStore);
  readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  readonly filter = signal<Filter>('all');
  readonly query = signal('');
  readonly openDetail = signal<string | null>(null);
  readonly unseen = signal(0);
  private follow = true;
  private lastCount = 0;
  readonly filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'conversation', label: 'Conversation' }, { key: 'tools', label: 'Tools' },
    { key: 'checks', label: 'Checks' }, { key: 'decisions', label: 'Decisions' }, { key: 'problems', label: 'Problems' },
  ];

  readonly blocks = computed<Block[]>(() => { this.store().version(); return [...this.store().model.blocks]; });
  readonly lastFinishId = computed(() => { const f = this.blocks().filter(x => x.type === 'finish'); return f.length ? f[f.length - 1].id : null; });

  readonly visible = computed(() => {
    const f = this.filter();
    const q = this.query().trim().toLowerCase();
    const model = this.store().model;
    return this.blocks().filter(b => {
      if (f === 'decisions' && b.type !== 'decision' && b.type !== 'policy' && b.type !== 'request') return false;
      if (f === 'conversation' && !(b.type === 'request' || b.type === 'cell' || b.type === 'finish')) return false;
      if (f === 'tools' && b.type !== 'cell') return false;
      if (f === 'checks' && !(b.type === 'cell' || (b.type === 'boundary' && /check|verified|CHK/i.test(b.text)) || b.type === 'finish')) return false;
      if (f === 'problems') {
        if (b.type === 'boundary') return b.tone === 'bad' || b.tone === 'warn';
        if (b.type === 'warning') return true;
        if (b.type === 'cell') {
          const c = model.cells.get(b.cell);
          return !!c && (c.status !== 'completed' && c.status !== 'running' || c.turns.some(t => t.gates.length || t.ops.some(o => /fail|reject|refus|denied/.test(o.status ?? ''))));
        }
        return false;
      }
      if (q) {
        if (b.type === 'boundary' || b.type === 'warning') return b.text.toLowerCase().includes(q);
        if (b.type === 'cell') {
          const c = model.cells.get(b.cell);
          return !!c && c.turns.some(t => (t.text ?? '').toLowerCase().includes(q) || t.ops.some(o => JSON.stringify(o.args ?? '').toLowerCase().includes(q) || (o.body ?? '').toLowerCase().includes(q)));
        }
      }
      return true;
    });
  });

  readonly firstRequest = computed(() => {
    const req = this.store().contract()?.requests?.[0]?.body?.text;
    return req ?? this.summary()?.title ?? '';
  });
  readonly firstAt = computed(() => this.store().contract()?.requests?.[0]?.body?.at ?? this.summary()?.createdAt ?? null);
  readonly activeTurn = computed(() => {
    this.store().version();
    const c = this.store().model.activeCell();
    return c?.status === 'running' ? c.turns[c.turns.length - 1] ?? null : null;
  });

  constructor() {
    effect(() => {
      const n = this.store().version();
      if (n !== this.lastCount && !this.follow) this.unseen.update(u => u + 1);
      this.lastCount = n;
    });
  }

  ngAfterViewChecked(): void {
    if (this.follow) {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  onScroll(): void {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    this.follow = atBottom;
    if (atBottom) this.unseen.set(0);
  }

  toLive(): void {
    this.follow = true;
    this.unseen.set(0);
    const el = this.scroller()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  decision(id: string) { return this.app.decisionMap().get(id); }

  requestText(version: number | null): string | null {
    const requests: any[] = this.store().contract()?.requests ?? [];
    const users = this.store().model.amendments.filter(a => a.by === 'user');
    const k = users.findIndex(a => a.version === version);
    const r = k >= 0 ? requests[k + 1] : null;
    return r?.body?.text ?? null;
  }

  policyLine(d: any): string {
    const reply = d.reply ?? {};
    if (d.kind === 'effect') return (reply.approved ? 'approved' : 'denied') + (reply.reason ? ' — ' + reply.reason : '');
    if (d.kind === 'question') return 'no answerer in autonomous mode → the cell ends blocked';
    if (d.kind === 'amendment') return (reply.outcome ?? '') + (reply.reason ? ' — ' + reply.reason : '');
    return d.status;
  }

  toggleDetail(id: string): void { this.openDetail.set(this.openDetail() === id ? null : id); }
  time(iso: string | null): string { return iso ? clock(iso) : ''; }
  protected readonly dateTime = dateTime;
}
