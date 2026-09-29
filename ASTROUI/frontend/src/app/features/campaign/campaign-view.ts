import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppStore } from '../../state/app.store';
import { CampaignStores } from '../../state/campaign.store';
import { StudioSocket } from '../../core/ws';
import { Icon } from '../../ui/icon';
import { MissionStrip } from './mission-strip';
import { ThreadTab } from '../thread/thread';
import { OverviewTab } from '../overview/overview';
import { PlanTab } from '../plan/plan';
import { ChangesTab } from '../changes/changes';
import { EvidenceTab } from '../evidence/evidence';
import { ContextTab } from '../context/context';
import { Composer } from '../composer/composer';
import { shortId, statusWord } from '../../core/format';

const TABS = [
  { key: 'thread', label: 'Thread' },
  { key: 'overview', label: 'Overview' },
  { key: 'plan', label: 'Plan' },
  { key: 'changes', label: 'Changes' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'context', label: 'Context' },
] as const;

/** A campaign (§4.3 W-01): header with identity chips, mission strip, six tabs, docked composer. */
@Component({
  selector: 'as-campaign-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, MissionStrip, ThreadTab, OverviewTab, PlanTab, ChangesTab, EvidenceTab, ContextTab, Composer],
  template: `
    @if (store(); as s) {
      <header class="head">
        <nav class="crumbs ellipsis" aria-label="Breadcrumb">
          <a [routerLink]="['/p', projectId()]">{{ project()?.name ?? projectId() }}</a>
          <as-icon name="chevron-right" [size]="13" />
          <span class="ctitle ellipsis" [title]="summary()?.title ?? ''">{{ summary()?.title ?? workId() }}</span>
        </nav>
        <span class="grow"></span>
        <div class="chips">
          @if (summary()?.demo) { <span class="chip warn" title="This campaign runs on the scripted demo model (fixture mode)">Demo data</span> }
          <button class="chip mono clickable" (click)="copy(workId())" [title]="'Work id ' + workId() + ' · attempt a1 — click to copy'">{{ short(workId()) }} · a1</button>
          @if (s.model.shape || summary()?.shape; as shape) {
            <span class="chip accent" [title]="shapeTip()">{{ shape }}</span>
          }
          <span class="chip" [title]="'Mode · answers ' + (summary()?.mode === 'Autonomous' ? 'by policy' : 'by you')">{{ summary()?.mode ?? 'Interactive' }}</span>
          <span class="chip warn" title="No sandbox. Effect classes are labels verified after the fact.">trusted-local ⚠</span>
          <span class="chip" title="Publication ceiling">ceiling {{ ceiling() }}</span>
        </div>
        <div class="menu-wrap">
          <button class="btn ghost sm icon" (click)="menu.set(!menu())" title="Campaign menu" aria-haspopup="menu"><as-icon name="more" /></button>
          @if (menu()) {
            <div class="menu" role="menu" (mouseleave)="menu.set(false)">
              <button role="menuitem" (click)="copyLink()"><as-icon name="link" [size]="14" /> Copy link</button>
              <button role="menuitem" (click)="rename()"><as-icon name="pencil" [size]="14" /> Rename</button>
              <button role="menuitem" (click)="pin()"><as-icon name="flag" [size]="14" /> {{ summary()?.pinned ? 'Unpin' : 'Pin' }}</button>
              <a role="menuitem" [href]="'/api/v1/campaigns/' + workId() + '/patch'" download><as-icon name="download" [size]="14" /> Export .patch (agent changes)</a>
              <button role="menuitem" (click)="newFromThis()"><as-icon name="rotate" [size]="14" /> New campaign from this</button>
              <button role="menuitem" (click)="archive()"><as-icon name="box" [size]="14" /> {{ summary()?.archived ? 'Unarchive' : 'Archive' }}</button>
            </div>
          }
        </div>
      </header>
      <as-mission-strip [store]="s" [summary]="summary() ?? null" (navigate)="go($event)" />
      <div class="tabs" role="tablist">
        @for (t of tabs; track t.key; let i = $index) {
          <a class="tab" role="tab" [class.on]="tab() === t.key" [attr.aria-selected]="tab() === t.key"
             [routerLink]="t.key === 'thread' ? ['/p', projectId(), 'c', workId()] : ['/p', projectId(), 'c', workId(), t.key]" [title]="t.label + ' (Alt+' + (i + 1) + ')'">
            {{ t.label }}
            @if (t.key === 'changes' && changedFiles() > 0) { <span class="count">{{ changedFiles() }}</span> }
            @if (t.key === 'evidence' && evidenceAlert()) { <i class="dot" title="A required item is red or stale"></i> }
            @if (t.key === 'thread' && pending() > 0) { <span class="count warn">{{ pending() }}</span> }
          </a>
        }
        <span class="grow"></span>
        @if (s.model.reconstructed) { <span class="chip" title="Live events of this campaign were not captured by this Studio; the Thread is rebuilt from the journal">reconstructed</span> }
      </div>
      <section class="content">
        @switch (tab()) {
          @case ('overview') { <as-overview-tab [store]="s" [summary]="summary() ?? null" /> }
          @case ('plan') { <as-plan-tab [store]="s" [summary]="summary() ?? null" /> }
          @case ('changes') { <as-changes-tab [store]="s" [summary]="summary() ?? null" /> }
          @case ('evidence') { <as-evidence-tab [store]="s" [summary]="summary() ?? null" /> }
          @case ('context') { <as-context-tab [store]="s" /> }
          @default { <as-thread-tab [store]="s" [summary]="summary() ?? null" /> }
        }
      </section>
      <as-composer [projectId]="projectId()" [workId]="workId()" [store]="s" [compact]="tab() !== 'thread'" />
    }`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .head{display:flex;align-items:center;gap:10px;height:48px;padding:0 12px 0 16px;border-bottom:1px solid var(--border-subtle);flex:none;min-width:0}
    .crumbs{display:flex;align-items:center;gap:6px;min-width:0;color:var(--text-tertiary)}
    .crumbs a{color:var(--text-secondary)}
    .ctitle{color:var(--text-primary);font-weight:600;max-width:36vw}
    .chips{display:flex;gap:6px;align-items:center;flex-wrap:nowrap;overflow:hidden;flex:none}
    .menu-wrap{position:relative}
    .menu{position:absolute;right:0;top:32px;z-index:20;min-width:240px;padding:4px;background:var(--bg-raised);border:1px solid var(--border-default);border-radius:8px;box-shadow:var(--shadow-overlay)}
    .menu button,.menu a{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 10px;border:0;background:none;color:var(--text-primary);border-radius:5px;cursor:pointer;text-decoration:none;font-size:12.5px}
    .menu button:hover,.menu a:hover{background:var(--bg-hover)}
    .tabs{display:flex;align-items:flex-end;gap:2px;height:36px;padding:0 12px;border-bottom:1px solid var(--border-subtle);flex:none}
    .tab{position:relative;display:flex;align-items:center;gap:6px;height:35px;padding:0 10px;color:var(--text-secondary);text-decoration:none;font-weight:500;border-bottom:2px solid transparent}
    .tab:hover{color:var(--text-primary);text-decoration:none}
    .tab.on{color:var(--text-primary);border-bottom-color:var(--accent)}
    .count{font-size:11px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--bg-active);display:grid;place-items:center;color:var(--text-secondary)}
    .count.warn{background:var(--attention-subtle);color:var(--attention)}
    .dot{width:6px;height:6px;border-radius:50%;background:var(--attention)}
    .content{flex:1;min-height:0;position:relative;display:flex;flex-direction:column}
  `],
})
export class CampaignView {
  private readonly stores = inject(CampaignStores);
  private readonly app = inject(AppStore);
  private readonly router = inject(Router);
  private readonly socket = inject(StudioSocket);
  readonly projectId = input.required<string>();
  readonly workId = input.required<string>();
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });
  readonly tabs = TABS;
  readonly menu = signal(false);

  readonly store = computed(() => this.stores.get(this.workId()));
  readonly summary = computed(() => this.app.campaign(this.workId()));
  readonly project = computed(() => this.app.project(this.projectId()));
  readonly tab = computed(() => this.tabParam() ?? 'thread');
  readonly pending = computed(() => this.app.decisionsFor(this.workId()).length);
  readonly changedFiles = computed(() => this.store().changes()?.files?.length ?? 0);
  readonly ceiling = computed(() => this.store().contract()?.view?.contracts?.slice(-1)[0]?.body?.authorization?.ladderCeiling ?? this.app.config()?.ceiling ?? 'Patch');
  readonly evidenceAlert = computed(() => {
    this.store().version();
    const f = this.store().finish()?.receipt;
    if (f?.acceptance?.some((a: any) => a.status === 'red' || a.currency === 'stale')) return true;
    return [...this.store().model.checkSummary.values()].some(v => /fail/i.test(v));
  });

  constructor() {
    effect(() => this.app.rememberWork(this.workId()));
    effect(() => {
      // Deep links to campaigns missing from the index: refresh the summary once.
      const w = this.workId();
      if (!this.app.campaign(w)) this.app.refreshCampaign(w);
    });
  }

  short(id: string): string { return shortId(id, 12); }
  shapeTip(): string { return 'Shape selected by policy: ' + (this.store().model.shapeInputs ?? 'inputs not captured'); }
  go(tab: string): void { this.router.navigate(tab === 'thread' ? ['/p', this.projectId(), 'c', this.workId()] : ['/p', this.projectId(), 'c', this.workId(), tab]); }
  copy(text: string): void { navigator.clipboard?.writeText(text); this.app.toast('neutral', 'Copied', text); }
  copyLink(): void { this.menu.set(false); this.copy(location.origin + this.router.url); }

  async rename(): Promise<void> {
    this.menu.set(false);
    const title = prompt('Campaign title (Studio metadata only)', this.summary()?.title ?? '');
    if (title === null) return;
    try { await this.socket.command('session.update', { title }, { workId: this.workId() }); } catch (e) { this.app.error(e, 'Rename'); }
  }

  async pin(): Promise<void> {
    this.menu.set(false);
    try { await this.socket.command('session.update', { pinned: !this.summary()?.pinned }, { workId: this.workId() }); } catch (e) { this.app.error(e, 'Pin'); }
  }

  async archive(): Promise<void> {
    this.menu.set(false);
    try { await this.socket.command('session.update', { archived: !this.summary()?.archived }, { workId: this.workId() }); } catch (e) { this.app.error(e, 'Archive'); }
  }

  newFromThis(): void {
    this.menu.set(false);
    this.router.navigate(['/new'], { queryParams: { project: this.projectId(), from: this.workId() } });
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    if (ev.altKey && /^[1-6]$/.test(ev.key)) {
      ev.preventDefault();
      this.go(TABS[+ev.key - 1].key);
    }
  }

  protected readonly statusWord = statusWord;
}
