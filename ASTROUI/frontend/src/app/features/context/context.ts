import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { CampaignStore } from '../../state/campaign.store';
import { Api } from '../../core/api';
import { AppStore } from '../../state/app.store';
import { Inspector } from '../shell/inspector';
import { clock, shortId, tokens } from '../../core/format';

/**
 * Context inspector (§12): the developer X-ray of what a cell saw — context stack per request against α, manifests,
 * workset (KNOWN / NOT SEEN), register history and invocations. Read-only; sizes are labelled as estimates or
 * provider-reported (R-CTX-01); α is never presented as progress (R-CTX-02). Past anchors are "not captured" (G-26).
 */
@Component({
  selector: 'as-context-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div class="bar">
      <span class="micro">Cell</span>
      <select class="select sm" [value]="cellId() ?? ''" (change)="pick($any($event.target).value)">
        @for (c of cells(); track c.id) { <option [value]="c.id" [selected]="c.id === cellId()">{{ c.role }} · {{ short(c.id) }} · {{ c.status }}</option> }
      </select>
      <span class="grow"></span>
      <span class="small dim">estimates from admission (cell.model_requested) · usage from the provider (usage rows)</span>
    </div>
    <div class="scroll body">
      <section class="card card-pad">
        <div class="micro">Context stack per request</div>
        @for (t of turns(); track t.n) {
          <div class="stackrow">
            <span class="mono small n">t{{ t.n }}</span>
            <span class="bar2" [title]="'estimated ' + (t.estimatedTokens ?? '?') + ' tokens · anchor ' + (t.anchorTokens ?? '?')">
              <i class="est" [style.width.%]="pct(t.estimatedTokens)"></i>
              <i class="anc" [style.width.%]="pct(t.anchorTokens)"></i>
              <b [style.left.%]="alpha()"></b>
            </span>
            <span class="mono small">est. {{ tok(t.estimatedTokens) }} · [A] {{ tok(t.anchorTokens) }} · out {{ t.outputTokens ?? '?' }} · in {{ t.inputTokens ?? '?' }}</span>
          </div>
        } @empty { <div class="dim small">No requests yet.</div> }
        <div class="legend small dim"><i class="sw est"></i> estimated request (admission) <i class="sw anc"></i> volatile anchor [A] <span class="tick"></span> α pressure threshold {{ alpha() }}% · limit {{ tok(limit()) }}</div>
      </section>
      <div class="two">
        <section class="card card-pad">
          <div class="micro">Manifests</div>
          @for (m of manifests(); track m.id) {
            <button class="btn ghost sm" (click)="openJson('Manifest ' + m.id, m.body)">{{ m.id }}</button>
            <div class="kv small">
              <span class="k">outcome · boundary</span><span class="v">{{ m.body?.outcome ?? '—' }} · {{ m.body?.boundaryReason ?? 'none' }}</span>
              <span class="k">estimated vs actual</span><span class="v mono">{{ tok(m.body?.estimatedTokens) }} est. (compiled) · {{ tok(m.body?.actualUsage) }} provider-reported input</span>
              @if (m.body?.arithmetic; as a) {
                <span class="k">budget arithmetic</span><span class="v mono">limit {{ tok(a.limit) }} · fixed {{ tok(a.knownFixed) }} · available {{ tok(a.available) }} · selected {{ tok(a.selected) }} · {{ a.policy }}</span>
              }
              <span class="k">selected units</span><span class="v mono">{{ (m.body?.selectedUnits ?? []).join(', ') || '—' }}</span>
              <span class="k">omissions</span><span class="v mono">{{ m.body?.omissions?.length ?? 0 }}</span>
              <span class="k">notes · seeds · skills</span><span class="v mono">{{ m.body?.notesInjected?.length ?? 0 }} · {{ m.body?.seeds?.length ?? 0 }} · {{ m.body?.skills?.length ?? 0 }}</span>
              <span class="k">profile · effort</span><span class="v mono">{{ m.body?.profile }} · {{ m.body?.effort }}</span>
            </div>
          } @empty { <div class="dim small">A manifest is recorded when the cell ends (reconstruction for running cells is not captured, G-26).</div> }
        </section>
        <section class="card card-pad">
          <div class="micro">Workset · KNOWN at {{ latestWorkset()?.key ?? '—' }}</div>
          <table class="table">
            <thead><tr><th>Path</th><th>Lines</th><th>Version</th><th>Source</th><th>Turn</th><th>Tokens</th></tr></thead>
            <tbody>
              @for (e of worksetEntries(); track e.path + e.turn) {
                <tr><td class="mono small">{{ e.path }}</td><td class="mono small">{{ lines(e.range) }}</td><td class="mono small">&#64;{{ (e.version ?? '').slice(0, 8) }}</td>
                  <td class="small">{{ e.source }}</td><td class="mono small">{{ e.turn }}</td><td class="mono small">{{ e.tokens }}</td></tr>
              } @empty { <tr><td colspan="6" class="dim small">No workset export for this cell.</td></tr> }
            </tbody>
          </table>
        </section>
      </div>
      <div class="two">
        <section class="card card-pad">
          <div class="micro">Register history</div>
          @for (r of registerHistory(); track r.version) {
            <button class="hist" (click)="openJson('STATE v' + r.version, r.body)"><span class="mono">v{{ r.version }}</span><span class="small dim">{{ time(r.createdAt) }}</span>
              <span class="small ellipsis grow">{{ r.body?.next ?? '' }}</span></button>
          } @empty { <div class="dim small">No register versions.</div> }
        </section>
        <section class="card card-pad">
          <div class="micro">Invocations</div>
          <table class="table">
            <thead><tr><th>Invocation</th><th>Profile</th><th>Tokens</th><th>Cost</th></tr></thead>
            <tbody>
              @for (c of invocations(); track c.invocationId) {
                <tr><td class="mono small">{{ c.invocationId }}</td><td class="mono small">{{ c.profileId }}</td>
                  <td class="mono small">{{ tok(c.totals?.totalTokens) }}</td>
                  <td class="mono small">{{ c.totals?.money?.[0] ? c.totals.money[0].amount + ' ' + c.totals.money[0].currency : 'unknown' }}</td></tr>
              } @empty { <tr><td colspan="4" class="dim small">No usage rows for this cell.</td></tr> }
            </tbody>
          </table>
        </section>
      </div>
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;flex:1;min-height:0}
    .bar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border-subtle);flex:none}
    .select.sm{height:24px;font-size:12px}
    .body{flex:1;padding:12px 16px 20px;display:flex;flex-direction:column;gap:10px}
    .small{font-size:12px}
    .stackrow{display:grid;grid-template-columns:36px minmax(160px,1fr) minmax(0,auto);gap:10px;align-items:center;padding:3px 0}
    .bar2{position:relative;height:8px;border-radius:4px;background:var(--bg-active)}
    .bar2 i{position:absolute;left:0;top:0;bottom:0;border-radius:4px}
    .bar2 .est{background:color-mix(in srgb,var(--accent) 55%,transparent)}
    .bar2 .anc{background:var(--attention);opacity:.8;height:3px;top:auto;bottom:0}
    .bar2 b{position:absolute;top:-3px;width:1px;height:14px;background:var(--text-tertiary)}
    .legend{display:flex;align-items:center;gap:8px;margin-top:8px}
    .sw{display:inline-block;width:14px;height:6px;border-radius:3px}
    .sw.est{background:color-mix(in srgb,var(--accent) 55%,transparent)} .sw.anc{background:var(--attention)}
    .tick{display:inline-block;width:1px;height:10px;background:var(--text-tertiary)}
    .two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
    .hist{display:flex;align-items:center;gap:8px;width:100%;height:26px;border:0;background:none;color:var(--text-primary);cursor:pointer;border-radius:4px;padding:0 6px;text-align:left}
    .hist:hover{background:var(--bg-hover)}
    @media (max-width:1279px){.two{grid-template-columns:minmax(0,1fr)}}
  `],
})
export class ContextTab {
  readonly store = input.required<CampaignStore>();
  private readonly api = inject(Api);
  private readonly app = inject(AppStore);
  private readonly inspector = inject(Inspector);
  readonly selected = signal<string | null>(null);
  readonly manifests = signal<any[]>([]);
  readonly workset = signal<any[]>([]);
  readonly registerHistory = signal<any[]>([]);

  readonly cells = computed(() => { this.store().version(); const m = this.store().model; return m.cellOrder.map(id => m.cells.get(id)!).filter(Boolean); });
  readonly cellId = computed(() => this.selected() ?? this.store().model.activeCell()?.id ?? this.cells()[0]?.id ?? null);
  readonly cell = computed(() => { this.store().version(); const id = this.cellId(); return id ? this.store().model.cells.get(id) ?? null : null; });
  readonly turns = computed(() => this.cell()?.turns ?? []);
  readonly limit = computed(() => {
    const pid = this.cell()?.profileId;
    return this.app.profiles().find(p => p.id === pid)?.profile?.capabilities?.contextLimitTokens ?? null;
  });
  readonly alpha = computed(() => Math.round((this.app.config()?.alpha ?? 0.65) * 100));
  readonly latestWorkset = computed(() => { const w = this.workset(); return w.length ? w[w.length - 1] : null; });
  readonly worksetEntries = computed(() => { const b = this.latestWorkset()?.body; return Array.isArray(b) ? b : []; });
  readonly invocations = computed(() => (this.store().budget()?.calls ?? []).filter((c: any) => c.contextId === this.cellId()));

  constructor() {
    effect(() => {
      const id = this.cellId();
      const w = this.store().work;
      this.store().version();
      if (!id) return;
      this.api.get<any[]>(`/campaigns/${w}/manifests/${id}`).then(m => this.manifests.set(m)).catch(() => this.manifests.set([]));
      this.api.get<any>(`/campaigns/${w}/workset/${id}`).then(x => this.workset.set(x?.exports ?? [])).catch(() => this.workset.set([]));
      this.api.get<any[]>(`/campaigns/${w}/register/${id}?history=true`).then(r => this.registerHistory.set([...r].reverse())).catch(() => this.registerHistory.set([]));
    });
  }

  pick(id: string): void { this.selected.set(id); }
  lines(r: any): string { return (r?.ranges ?? []).map((x: any) => x.from + '-' + x.to).join(', ') || '—'; }
  pct(n: number | null): number { const l = this.limit(); return n && l ? Math.min(100, n / l * 100) : 0; }
  tok(n: number | null | undefined): string { return n === null || n === undefined ? '?' : tokens(n); }
  short(id: string): string { return shortId(id, 12); }
  time(iso: string): string { return clock(iso); }
  openJson(title: string, data: any): void { this.inspector.open({ type: 'json', title, data }); }
}
