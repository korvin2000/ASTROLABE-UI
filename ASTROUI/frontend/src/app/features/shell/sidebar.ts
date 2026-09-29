import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AppStore } from '../../state/app.store';
import { Icon } from '../../ui/icon';
import { Glyph, Mark } from '../../ui/glyph';
import { relTime } from '../../core/format';
import { CampaignSummary, Project } from '../../core/model';
import { StudioSocket } from '../../core/ws';

/** The sidebar (§4.4): projects → campaigns (fixed order), Library, and the Needs-you / Activity / provider footer. */
@Component({
  selector: 'as-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Glyph, Mark],
  template: `
    <div class="top">
      <a class="brand" routerLink="/" title="ASTROLABE Studio">
        <as-mark [size]="22" />
        <span class="word">ASTROLABE</span>
      </a>
      <span class="grow"></span>
      <button class="btn ghost sm icon" (click)="palette.emit()" title="Command palette (Ctrl+K)"><as-icon name="search" [size]="15" /></button>
    </div>
    <div class="new">
      <a class="btn newbtn" routerLink="/new" title="New campaign (Alt+N)"><as-icon name="plus" [size]="15" /> New campaign <span class="grow"></span><kbd>Alt N</kbd></a>
    </div>
    <nav class="scroll nav" aria-label="Projects and library">
      <div class="section">
        <span class="micro">Projects</span>
        <span class="grow"></span>
        <button class="btn ghost sm icon" (click)="addProject.emit()" title="Add repository"><as-icon name="plus" [size]="14" /></button>
      </div>
      @for (p of app.projects(); track p.id) {
        <div class="proj" [class.current]="p.id === currentProject()">
          <button class="twist" (click)="toggle(p.id)" [attr.aria-expanded]="isOpen(p.id)" [attr.aria-label]="'Toggle ' + p.name">
            <as-icon [name]="isOpen(p.id) ? 'chevron-down' : 'chevron-right'" [size]="13" />
          </button>
          <a class="pname grow" [routerLink]="['/p', p.id]" [title]="p.path">
            <span class="ellipsis">{{ p.name }}</span>
            @if (p.demo) { <span class="demo">demo</span> }
          </a>
          @if (p.runningWork) { <as-glyph status="running" [pulse]="true" label="campaign running" /> }
          @else if (!p.open) { <as-glyph glyph="lock" [label]="p.exists ? 'not open (locked by another process or closed)' : 'repository missing'" /> }
          @if (p.branch) { <span class="branch mono" [title]="'branch ' + p.branch">{{ p.branch }}</span> }
        </div>
        @if (isOpen(p.id)) {
          @for (c of campaignsOf(p); track c.workId) {
            <a class="camp" [class.active]="c.workId === currentWork()" [routerLink]="['/p', p.id, 'c', c.workId]" [title]="c.title ?? c.workId">
              <as-glyph [status]="c.pendingDecisions > 0 ? 'needs_you' : c.displayStatus" [pulse]="c.live" [label]="statusLabel(c)" />
              <span class="ctitle ellipsis grow">{{ c.title ?? c.workId }}</span>
              <span class="when">{{ rel(c.updatedAt) }}</span>
            </a>
          } @empty {
            <div class="none meta">No campaigns yet</div>
          }
          @if (moreOf(p) > 0) { <a class="more meta" [routerLink]="['/p', p.id]">{{ moreOf(p) }} more…</a> }
        }
      } @empty {
        <div class="none meta">Add a repository to start.</div>
      }

      <div class="section lib"><span class="micro">Library</span></div>
      <a class="lnk" routerLink="/knowledge" routerLinkActive="on"><as-icon name="book" [size]="15" /> Knowledge</a>
      <a class="lnk" routerLink="/stats"><as-icon name="chart" [size]="15" /> Statistics</a>
      <a class="lnk" routerLink="/providers"><as-icon name="plug" [size]="15" /> Providers & models</a>
      <a class="lnk" routerLink="/settings"><as-icon name="settings" [size]="15" /> Settings</a>
    </nav>
    <footer class="foot">
      <a class="lnk" routerLink="/inbox" [class.hot]="app.pendingDecisions().length > 0">
        <as-icon name="flag" [size]="15" /> Needs you <span class="grow"></span>
        @if (app.pendingDecisions().length) { <span class="badge warn">{{ app.pendingDecisions().length }}</span> }
      </a>
      <a class="lnk" routerLink="/activity">
        <as-icon name="activity" [size]="15" /> Activity <span class="grow"></span>
        @if (app.liveCount()) { <span class="badge">{{ app.liveCount() }}</span> }
      </a>
      <div class="providers">
        @for (pr of app.providers(); track pr.id) {
          <a class="pdot" [routerLink]="['/providers', pr.id]" [title]="pr.name + ' · ' + pr.auth.state">
            <i [class.ok]="pr.auth.state === 'CONFIGURED' || pr.demo" [class.warn]="pr.auth.state === 'EXPIRING'" [class.bad]="pr.auth.state === 'EXPIRED' || pr.auth.state === 'REFRESH_FAILED'"></i>
            {{ pr.demo ? 'demo' : pr.id }}
          </a>
        }
        <span class="grow"></span>
        <span class="conn" [class.bad]="socket.state() !== 'open'" [title]="'Live connection: ' + socket.state()"><i></i>{{ socket.state() === 'open' ? 'live' : socket.state() }}</span>
      </div>
    </footer>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;background:var(--bg-sidebar);border-right:1px solid var(--border-subtle);min-width:0}
    .top{display:flex;align-items:center;gap:8px;height:48px;padding:0 10px 0 14px;flex:none}
    .brand{display:flex;align-items:center;gap:9px;color:var(--text-primary);text-decoration:none}
    .word{font-weight:600;font-size:12px;letter-spacing:.14em}
    .new{padding:2px 10px 8px;flex:none}
    .newbtn{width:100%;justify-content:flex-start;text-decoration:none;background:var(--bg-surface)}
    .newbtn kbd{font-size:10px}
    .nav{flex:1;padding:4px 6px 10px}
    .section{display:flex;align-items:center;height:28px;padding:0 6px 0 8px;margin-top:6px}
    .lib{margin-top:16px}
    .proj{display:flex;align-items:center;gap:4px;height:28px;padding:0 6px 0 2px;border-radius:5px;color:var(--text-primary)}
    .proj:hover{background:var(--bg-hover)}
    .twist{border:0;background:none;color:var(--text-tertiary);width:20px;height:22px;display:grid;place-items:center;cursor:pointer;border-radius:4px}
    .twist:hover{color:var(--text-primary)}
    .pname{display:flex;align-items:center;gap:6px;color:inherit;text-decoration:none;font-weight:500;min-width:0}
    .demo{font-size:10px;line-height:14px;padding:0 4px;border-radius:3px;border:1px solid var(--border-default);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em}
    .branch{font-size:11px;color:var(--text-tertiary);max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .camp{position:relative;display:flex;align-items:center;gap:8px;height:28px;padding:0 8px 0 28px;border-radius:5px;color:var(--text-secondary);text-decoration:none}
    .camp:hover{background:var(--bg-hover);color:var(--text-primary);text-decoration:none}
    .camp.active{background:var(--bg-active);color:var(--text-primary)}
    .camp.active::before{content:"";position:absolute;left:18px;top:6px;bottom:6px;width:2px;border-radius:2px;background:var(--accent)}
    .ctitle{font-size:12.5px}
    .when{font-size:11px;color:var(--text-tertiary)}
    .none{padding:4px 10px 4px 30px}
    .more{display:block;padding:2px 10px 4px 30px}
    .lnk{display:flex;align-items:center;gap:9px;height:30px;padding:0 10px;border-radius:5px;color:var(--text-secondary);text-decoration:none}
    .lnk:hover{background:var(--bg-hover);color:var(--text-primary);text-decoration:none}
    .lnk.hot{color:var(--attention)}
    .foot{flex:none;border-top:1px solid var(--border-subtle);padding:6px}
    .badge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--bg-active);color:var(--text-primary);font-size:11px;display:grid;place-items:center}
    .badge.warn{background:var(--attention-subtle);color:var(--attention);border:1px solid color-mix(in srgb,var(--attention) 40%,transparent)}
    .providers{display:flex;align-items:center;gap:8px;padding:6px 10px 2px;flex-wrap:wrap}
    .pdot{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text-tertiary);text-decoration:none}
    .pdot i,.conn i{width:6px;height:6px;border-radius:50%;background:var(--neutral-mark);display:inline-block}
    .pdot i.ok,.conn i{background:var(--success)} .pdot i.warn{background:var(--attention)} .pdot i.bad,.conn.bad i{background:var(--danger)}
    .conn{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text-tertiary)}
  `],
})
export class Sidebar {
  readonly app = inject(AppStore);
  readonly socket = inject(StudioSocket);
  private readonly router = inject(Router);
  readonly palette = output<void>();
  readonly addProject = output<void>();
  private readonly collapsed = signal<Set<string>>(new Set(JSON.parse(localStorage.getItem('studio.collapsed') || '[]')));

  private readonly url = toSignal(this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url });
  readonly currentWork = computed(() => /\/c\/([^/?]+)/.exec(this.url())?.[1] ?? null);
  readonly currentProject = computed(() => /\/p\/([^/?]+)/.exec(this.url())?.[1] ?? null);

  isOpen(id: string): boolean { return !this.collapsed().has(id); }

  toggle(id: string): void {
    const s = new Set(this.collapsed());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.collapsed.set(s);
    try { localStorage.setItem('studio.collapsed', JSON.stringify([...s])); } catch { /* ignore */ }
  }

  campaignsOf(p: Project): CampaignSummary[] { return this.app.projectCampaigns(p.id).slice(0, 8); }
  moreOf(p: Project): number { return Math.max(0, this.app.projectCampaigns(p.id).length - 8); }
  rel(iso: string): string { return relTime(iso); }
  statusLabel(c: CampaignSummary): string { return (c.pendingDecisions > 0 ? 'needs you · ' : '') + c.displayStatus.replace(/_/g, ' '); }
}
