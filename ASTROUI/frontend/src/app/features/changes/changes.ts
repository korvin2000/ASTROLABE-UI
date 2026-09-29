import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CampaignStore } from '../../state/campaign.store';
import { CampaignSummary } from '../../core/model';
import { Api } from '../../core/api';
import { StudioSocket } from '../../core/ws';
import { AppStore } from '../../state/app.store';
import { DiffView } from '../../ui/diff-view';
import { Icon } from '../../ui/icon';
import { Glyph } from '../../ui/glyph';

const STAGES = ['Patch', 'LocalCommit', 'Push', 'Merge', 'Deploy'];
const ATTR: Record<string, { letter: string; label: string }> = {
  agent: { letter: 'A', label: 'agent' }, run: { letter: 'R', label: 'by run' }, user: { letter: 'U', label: 'pre-existing' },
  external: { letter: 'X', label: 'external' }, unknown: { letter: '?', label: 'unattributed' },
};

/**
 * Changes and publication (§10, W-04): per-turn shadow-ref snapshots compared read-only, files attributed
 * A/R/U/X/?, a diff viewer, and the permission ladder where every stage above Patch is a separate approval
 * (R-CHG-02: never "delivered" for a patch). The Studio never writes refs, index or working tree (R-CHG-01).
 */
@Component({
  selector: 'as-changes-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DiffView, Icon, Glyph],
  template: `
    @let ch = store().changes();
    <div class="bar">
      <span class="micro">Compare</span>
      @if (snaps().length > 1) {
        <select class="select sm" [value]="from()" (change)="from.set(+$any($event.target).value)">@for (s of snaps(); track s.turn) { <option [value]="s.turn" [selected]="s.turn === from()">turn {{ s.turn }}{{ s.turn === 0 ? ' (snapshot 0)' : '' }}</option> }</select>
        <as-icon name="chevron-right" [size]="13" />
        <select class="select sm" [value]="toTurn()" (change)="to.set(+$any($event.target).value)">@for (s of snaps(); track s.turn) { <option [value]="s.turn" [selected]="s.turn === toTurn()">turn {{ s.turn }}{{ s.turn === lastTurn() ? ' (current)' : '' }}</option> }</select>
      } @else { <span class="dim small">{{ ch?.reason ?? 'no snapshots yet' }}</span> }
      <span class="grow"></span>
      <label class="check small" title="With core.autocrlf a touched file can be recorded with CRLF while snapshot 0 holds LF; ignoring end-of-line CR shows the real edit"><input type="checkbox" [checked]="ignoreEol()" (change)="ignoreEol.set(!ignoreEol())" /> Ignore line endings</label>
      @for (k of attrKinds; track k) {
        <label class="check small"><input type="checkbox" [checked]="shown().has(k)" (change)="toggleAttr(k)" /> {{ attr(k).letter }} {{ attr(k).label }}</label>
      }
    </div>
    <div class="body">
      <aside class="files card">
        <div class="phead"><span class="micro">Files ({{ files().length }})</span></div>
        <div class="scroll">
          @for (f of files(); track f.path) {
            <button class="file" [class.on]="selected() === f.path" (click)="selected.set(f.path)">
              <span class="attr mono" [class]="f.attribution" [title]="attr(f.attribution).label">{{ attr(f.attribution).letter }}</span>
              <span class="ellipsis grow mono p" [title]="f.path">{{ f.path }}</span>
              @if (f.eolChanged) { <span class="chip eol" [title]="f.eolOnly ? 'Only line endings differ (CRLF/LF)' : 'Line endings differ too (CRLF/LF); counts ignore them'">{{ f.eolOnly ? 'EOL only' : 'EOL' }}</span> }
              <span class="mono ok">+{{ f.added ?? 0 }}</span><span class="mono bad">−{{ f.removed ?? 0 }}</span>
            </button>
          } @empty { <div class="dim small pad">No changes in this range.</div> }
          @if (ch?.preExisting?.length) {
            <div class="micro pre">Pre-existing (U) · never offered for revert</div>
            @for (p of ch.preExisting; track p) { <div class="file static"><span class="attr mono user">U</span><span class="mono p ellipsis">{{ p }}</span></div> }
          }
        </div>
      </aside>
      <section class="diff card">
        <div class="phead">
          <span class="mono ellipsis grow">{{ selected() ?? 'Select a file' }}</span>
          @if (selected() && selectedAttr() === 'agent' && summary()?.live) {
            <button class="btn sm" (click)="askRevert()" title="Pre-fills an amendment; ASTROLABE reverts through its own guarded operations (G-20)"><as-icon name="rotate" [size]="13" /> Ask the agent to revert</button>
          }
        </div>
        <div class="scroll dbody">
          @if (diff() !== null) { <as-diff-view [diff]="diff() ?? ''" [showHeader]="false" /> }
          @else if (selected()) { <div class="dim small">Loading diff…</div> }
          @else { <div class="empty"><as-icon name="diff" [size]="22" /><span>Pick a file to see its diff between the chosen snapshots.</span></div> }
        </div>
      </section>
    </div>
    <div class="ladder card">
      <span class="micro">Publication</span>
      @for (s of stages; track s; let last = $last) {
        <span class="stage" [class.reached]="reachedIndex() >= $index" [class.over]="$index > ceilingIndex()" [title]="$index > ceilingIndex() ? 'above the ceiling' : ''">
          <as-glyph [status]="reachedIndex() >= $index ? 'verified' : $index > ceilingIndex() ? 'notrun' : 'pending'" [size]="11" /> {{ s }}
        </span>
        @if (!last) { <span class="link"></span> }
      }
      <span class="grow"></span>
      <span class="small dim">ceiling {{ ceiling() }} · highest authorized {{ reached() }}</span>
      <a class="btn sm" [href]="'/api/v1/campaigns/' + store().work + '/patch'" download><as-icon name="download" [size]="13" /> Export .patch</a>
      <button class="btn sm primary" (click)="formOpen.set(!formOpen())" [disabled]="!canPublish()" [title]="publishReason()">Request publication…</button>
    </div>
    @if (formOpen()) {
      <div class="pubform card">
        <div class="row wrap">
          <label>Through <select class="select sm" [value]="through()" (change)="through.set($any($event.target).value)">@for (s of stages.slice(1); track s) { <option [value]="s" [selected]="s === through()" [disabled]="stages.indexOf(s) > ceilingIndex()">{{ s }}</option> }</select></label>
          <label>Remote <input class="input sm" [value]="remote()" (input)="remote.set($any($event.target).value)" placeholder="origin" /></label>
          <label>Merge target <input class="input sm" [value]="mergeTarget()" (input)="mergeTarget.set($any($event.target).value)" placeholder="main" /></label>
          <label class="grow">Message <input class="input sm" style="width:100%" [value]="message()" (input)="message.set($any($event.target).value)" placeholder="default names the work and attempt" /></label>
        </div>
        <div class="small dim">Local commit writes <span class="mono">refs/heads/astrolabe/{{ store().work }}/a1</span> — never your branch. Each stage arrives as its own approval decision; Deploy needs a host deployer (none in v1).</div>
        <div class="row end"><button class="btn" (click)="formOpen.set(false)">Close</button><button class="btn primary" (click)="publish()" [disabled]="busy()">Request</button></div>
      </div>
    }`,
  styles: [`
    :host{display:flex;flex-direction:column;flex:1;min-height:0}
    .bar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border-subtle);flex:none;flex-wrap:wrap}
    .select.sm,.input.sm{height:24px;font-size:12px}
    .small{font-size:12px}
    .body{display:grid;grid-template-columns:320px minmax(0,1fr);gap:10px;padding:10px 16px;flex:1;min-height:0}
    .card{display:flex;flex-direction:column;min-height:0}
    .phead{display:flex;align-items:center;gap:8px;height:34px;padding:0 10px;border-bottom:1px solid var(--border-subtle);flex:none}
    .file{display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 10px;border:0;background:none;color:var(--text-secondary);cursor:pointer;text-align:left}
    .file:hover{background:var(--bg-hover)} .file.on{background:var(--bg-active);color:var(--text-primary)}
    .file.static{cursor:default}
    .p{font-size:12px}
    .attr{width:18px;height:18px;border-radius:3px;display:grid;place-items:center;font-size:11px;border:1px solid var(--border-default)}
    .attr.agent{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,var(--border-default))}
    .attr.user{color:var(--text-tertiary)} .attr.external{color:var(--attention)} .attr.unknown{color:var(--danger)}
    .ok{color:var(--success);font-size:11.5px} .bad{color:var(--danger);font-size:11.5px}
    .pre{padding:10px 10px 4px}
    .eol{font-size:10px;height:16px;padding:0 5px;color:var(--attention)}
    .pad{padding:12px}
    .dbody{padding:10px;flex:1}
    .ladder{flex-direction:row;align-items:center;gap:6px;margin:0 16px 10px;padding:8px 12px;flex:none;flex-wrap:wrap}
    .stage{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:2px 8px;border-radius:10px;border:1px solid var(--border-default);color:var(--text-secondary)}
    .stage.reached{color:var(--text-primary);border-color:color-mix(in srgb,var(--success) 45%,var(--border-default))}
    .stage.over{opacity:.55;border-style:dashed}
    .link{width:14px;height:1px;background:var(--border-default)}
    .pubform{margin:0 16px 12px;padding:10px 12px;gap:8px;flex:none}
    .pubform label{display:flex;align-items:center;gap:6px;font-size:12px}
    .end{justify-content:flex-end}
  `],
})
export class ChangesTab {
  readonly store = input.required<CampaignStore>();
  readonly summary = input<CampaignSummary | null>(null);
  private readonly api = inject(Api);
  private readonly socket = inject(StudioSocket);
  private readonly app = inject(AppStore);
  private readonly router = inject(Router);
  readonly stages = STAGES;
  readonly attrKinds = ['agent', 'run', 'user', 'external', 'unknown'];
  readonly from = signal(0);
  /** null = follow the latest snapshot. */
  readonly to = signal<number | null>(null);
  readonly toTurn = computed(() => this.to() ?? this.lastTurn());
  readonly selected = signal<string | null>(null);
  readonly diff = signal<string | null>(null);
  readonly shown = signal(new Set(['agent', 'run', 'external', 'unknown']));
  readonly formOpen = signal(false);
  readonly through = signal('LocalCommit');
  readonly remote = signal('');
  readonly mergeTarget = signal('');
  readonly message = signal('');
  readonly busy = signal(false);
  /** Ignore CR at end of line in counts and diffs (the store's default view is fetched the same way). */
  readonly ignoreEol = signal(true);
  private rangeData = signal<any>(null);

  readonly snaps = computed(() => (this.store().changes()?.snapshots ?? []) as { turn: number }[]);
  readonly lastTurn = computed(() => { const s = this.snaps(); return s.length ? s[s.length - 1].turn : 0; });
  readonly data = computed(() => this.rangeData() ?? this.store().changes());
  readonly files = computed(() => ((this.data()?.files ?? []) as any[]).filter(f => this.shown().has(f.attribution)));
  readonly selectedAttr = computed(() => this.files().find(f => f.path === this.selected())?.attribution);
  readonly ceiling = computed(() => this.store().contract()?.view?.contracts?.slice(-1)[0]?.body?.authorization?.ladderCeiling ?? 'Patch');
  readonly ceilingIndex = computed(() => STAGES.indexOf(this.ceiling()));
  readonly reached = computed(() => this.store().finish()?.receipt?.highestAuthorizedStage ?? (this.store().finish()?.available ? 'Patch' : '—'));
  readonly reachedIndex = computed(() => STAGES.indexOf(this.reached()));
  readonly canPublish = computed(() => !!this.summary()?.allowedActions?.find(a => a.name === 'publish')?.enabled && this.ceilingIndex() > 0);
  readonly publishReason = computed(() => this.ceilingIndex() === 0 ? 'Needs ceiling ≥ LocalCommit (Settings › Autonomy; applies to new campaigns)' : this.summary()?.allowedActions?.find(a => a.name === 'publish')?.reason ?? '');

  constructor() {
    effect(() => {
      const f = this.from(), t = this.toTurn(), eol = this.ignoreEol();
      if (!this.snaps().length) return;
      if (f === 0 && t === this.lastTurn() && eol) { this.rangeData.set(null); return; }
      this.api.get(`/campaigns/${this.store().work}/changes?from=${f}&to=${t}&ignoreEol=${eol}`).then(d => this.rangeData.set(d)).catch(() => {});
    });
    effect(() => {
      const path = this.selected();
      const f = this.from(), t = this.toTurn();
      this.diff.set(null);
      if (!path) return;
      const q = new URLSearchParams({ path, from: String(f), to: String(t), ignoreEol: String(this.ignoreEol()) });
      this.api.get<any>(`/campaigns/${this.store().work}/diff?${q}`).then(d => this.diff.set(d.diff ?? '')).catch(() => this.diff.set(''));
    });
    effect(() => { if (!this.selected() && this.files().length) this.selected.set(this.files()[0].path); });
  }

  attr(k: string) { return ATTR[k] ?? ATTR['unknown']; }
  toggleAttr(k: string): void { const s = new Set(this.shown()); if (s.has(k)) s.delete(k); else s.add(k); this.shown.set(s); }

  askRevert(): void {
    const s = this.summary();
    if (!s) return;
    const text = `Revert the agent's edits to ${this.selected()} because …`;
    try { sessionStorage.setItem(`studio.draft.${s.workId}.amend`, text); } catch { /* ignore */ }
    this.router.navigate(['/p', s.projectId, 'c', s.workId]);
    this.app.toast('neutral', 'Amendment drafted', 'Complete the reason in the composer and submit it.');
  }

  async publish(): Promise<void> {
    this.busy.set(true);
    try {
      await this.socket.command('publication.request', {
        through: this.through(), remote: this.remote() || null, mergeTarget: this.mergeTarget() || null, knownRemotes: this.remote() ? [this.remote()] : [], message: this.message() || null,
      }, { workId: this.store().work }, {}, true);
      this.formOpen.set(false);
      this.app.toast('ok', 'Publication requested', 'Each stage arrives as an approval decision.');
    } catch (e) {
      this.app.error(e, 'Publication');
    } finally {
      this.busy.set(false);
    }
  }
}
