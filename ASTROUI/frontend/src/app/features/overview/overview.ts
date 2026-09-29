import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CampaignStore } from '../../state/campaign.store';
import { AppStore } from '../../state/app.store';
import { CampaignSummary } from '../../core/model';
import { NodeId } from '../../reducers/campaign-model';
import { FlowCanvas, NODES } from './flow-canvas';
import { Glyph } from '../../ui/glyph';
import { clock, countdown, duration, firstLine, money, shortId, tokens } from '../../core/format';
import { ROLE_ICON } from '../thread/cell-section';

/**
 * The Agent Overview (§8, W-02): where the campaign is, which agent is active and what it does this turn, why (its
 * STATE register — the only "reasoning" surface, R-OVR-08), what waits for you, and whether it is healthy. Every
 * visual change is caused by a stream item (R-OVR-01); the list view is the accessible equivalent (§8.11).
 */
@Component({
  selector: 'as-overview-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlowCanvas, Glyph],
  template: `
    @let m = store().model;
    <div class="rail">
      @for (st of rail(); track st.key; let last = $last) {
        <span class="stage" [class]="st.state" [title]="st.detail ?? st.label">
          <as-glyph [status]="railGlyph(st.state)" [pulse]="st.state === 'active'" [size]="11" /> {{ st.label }}
        </span>
        @if (!last) { <span class="link"></span> }
      }
      <span class="grow"></span>
      <div class="seg">
        <button [class.on]="view() === 'flow'" (click)="view.set('flow')">Flow</button>
        <button [class.on]="view() === 'list'" (click)="view.set('list')">≣ List</button>
      </div>
      @if (live()) { <span class="chip accent"><as-glyph status="running" [pulse]="true" [size]="10" /> Live</span> }
      @else { <span class="chip">{{ summary()?.displayStatus?.replaceAll('_', ' ') ?? 'history' }}</span> }
    </div>
    <div class="grid">
      <div class="canvas card">
        @if (view() === 'flow') {
          <as-flow-canvas [store]="store()" (select)="onNode($event)" />
          <div class="history">
            <span class="micro">turn history</span>
            @for (h of history(); track h.cell + '-' + h.turn) {
              <button class="hbox" [class.ok]="h.checks === 'ok'" [class.bad]="h.checks === 'bad' || h.blocked" [class.gate]="h.gates > 0"
                [title]="'turn ' + h.turn + ' · ' + h.edits + ' edit(s) · checks ' + (h.checks ?? 'none') + (h.gates ? ' · ' + h.gates + ' gate(s)' : '')"
                (click)="toThread()">{{ h.edits ? '✎' : h.turn }}</button>
            } @empty { <span class="dim small">no completed turns yet</span> }
          </div>
        } @else {
          <table class="table list" role="grid" aria-label="Components">
            <thead><tr><th>Component</th><th>State</th><th>Latest</th></tr></thead>
            <tbody>
              @for (n of nodes; track n.id) {
                <tr class="clickable" (click)="onNode(n.id)" tabindex="0"><td class="mono">{{ n.id }}</td><td><as-glyph [status]="nodeGlyph(n.id)" /> {{ m.nodes[n.id].state }}</td><td class="mono">{{ m.nodes[n.id].lines.join(' · ') }}</td></tr>
              }
            </tbody>
          </table>
        }
      </div>
      <aside class="agent card">
        <div class="ahead micro">Active agent</div>
        @if (cell(); as c) {
          <div class="who"><span class="ricon">{{ roleIcon(c.role) }}</span><b>{{ c.role }}</b><span class="dim mono">{{ short(c.id) }}</span>
            <span class="grow"></span><as-glyph [status]="c.status" [pulse]="c.status === 'running'" /><span class="small">{{ c.status }}</span></div>
          @if (c.incrementId) { <div class="small ellipsis" [title]="incTitle() ?? ''">{{ c.incrementId }} @if (incTitle()) { <span class="dim">“{{ incTitle() }}”</span> }</div> }
          <div class="kv small">
            <span class="k">profile</span><span class="v mono">{{ c.profileId ?? '—' }}</span>
            <span class="k">turn</span><span class="v"><span class="mono">{{ turn()?.n ?? 0 }} / {{ turn()?.turnsMax ?? c.turnsMax ?? '?' }}</span>
              <span class="meter" style="margin-top:4px"><i [style.width.%]="turnPct()"></i></span></span>
            <span class="k">now</span><span class="v mono">@if (currentOp(); as op) { {{ op.label }} · {{ since(op.since) }} } @else { <span class="dim">—</span> }</span>
            <span class="k">context</span>
            <span class="v">
              @if (ctx(); as x) {
                <span class="stack" [title]="'estimated ' + x.est + ' of ' + x.limit + ' tokens (provider limit); α at ' + x.alpha + '%'">
                  <i class="fill" [style.width.%]="x.pct"></i><b [style.left.%]="x.alpha"></b>
                </span>
                <span class="mono">{{ x.pct }}% · est. {{ tok(x.est) }} / {{ tok(x.limit) }}</span>
              } @else { <span class="dim">no request yet</span> }
            </span>
            <span class="k">reserve</span><span class="v mono">{{ m.lastGauge?.reserve ?? '—' }}</span>
            <span class="k">checks</span><span class="v">@for (ch of checks(); track ch[0]) { <span class="small ck"><as-glyph [status]="ch[1]" [size]="10" /> {{ ch[0].replace('CHK-', '') }}</span> } @empty { <span class="dim">none yet</span> }</span>
            <span class="k">budget</span><span class="v mono">{{ tokensLine() }}</span>
            <span class="k">gates</span><span class="v">@if (c.gates) { <span class="warn">⚑ {{ c.gates }} in this cell</span> } @else { <span class="dim">none</span> }</span>
            <span class="k">waiting</span><span class="v">@if (waiting(); as w) { <span class="warn">{{ w }}</span> } @else { <span class="dim">—</span> }</span>
          </div>
          @if (children().length) {
            <div class="micro sub">Children</div>
            @for (ch of children(); track ch.handle) { <div class="small row"><as-glyph [status]="ch.status" [size]="10" /> {{ ch.kind }} <span class="dim mono">{{ ch.handle }}</span> · {{ ch.status }}</div> }
          }
        } @else {
          <div class="dim small">No cell has started yet. The controller opens the campaign, selects the shape and compiles the first increment's context.</div>
        }
      </aside>
      <section class="reasoning card">
        <div class="phead">
          <span class="micro">Reasoning · STATE register</span>
          @if (reg(); as r) { <span class="chip mono">v{{ r.version }}</span> }
          <span class="grow"></span>
          @if (regSize(); as s) { <span class="small dim mono" title="register size vs registerCapTokens">{{ s }}</span> }
        </div>
        <div class="scroll rbody">
          @if (reg(); as r) {
            @if (r.constraints?.length) { <div class="rsec"><span class="rk">Constraints</span><span>@for (c of r.constraints; track $index) { <span class="chip">{{ txt(c) }}</span> }</span></div> }
            <div class="rsec"><span class="rk">Plan</span>
              <div class="rlist">
                @for (p of r.plan ?? []; track p.n) {
                  <div class="pl" [class]="p.mark">
                    <span class="mk">{{ planMark(p.mark) }}</span><span class="mono dim">{{ p.n }}</span>
                    <span [class.strike]="p.mark === 'cancelled'">{{ p.text }}</span>
                    @if (p.accept) { <span class="chip mono">{{ p.accept }}</span> }
                    @if (p.evidence) { <span class="dim mono">{{ p.evidence }}</span> }
                    @if (p.reason) { <span class="dim">— {{ p.reason }}</span> }
                  </div>
                } @empty { <span class="dim">no plan steps</span> }
              </div>
            </div>
            <div class="rsec"><span class="rk">Facts</span>
              <div class="rlist">
                @for (f of r.facts ?? []; track f.n) {
                  <div class="pl"><as-glyph [status]="f.kind === 'v' ? 'verified' : f.kind === 'x' ? 'refuted' : 'hypothesis'" [size]="11" />
                    <span [class.strike]="f.kind === 'x'">{{ f.text }}</span>
                    @if (f.evidenceId) { <span class="dim mono">{{ f.evidenceId }}</span> }
                    @if (f.staleAt) { <span class="warn small">stale &#64;{{ f.staleAt }}</span> }
                  </div>
                } @empty { <span class="dim">none</span> }
              </div>
            </div>
            @if (r.deadEnds?.length) { <div class="rsec"><span class="rk">Dead ends</span><div class="rlist">@for (d of r.deadEnds; track $index) { <div class="pl">✕ {{ txt(d) }}</div> }</div></div> }
            @if (r.decisions?.length) { <div class="rsec"><span class="rk">Decisions</span><div class="rlist">@for (d of r.decisions; track $index) { <div class="pl"><span class="mono dim">D{{ d.n ?? $index + 1 }}</span> {{ d.text }} @if (d.because) { <span class="dim">— because {{ d.because }}</span> }</div> }</div></div> }
            @if (r.open?.length) { <div class="rsec"><span class="rk">Open</span><div class="rlist">@for (o of r.open; track $index) { <div class="pl">? {{ txt(o) }}</div> }</div></div> }
            @if (r.focus) { <div class="rsec"><span class="rk">Focus</span><span class="mono">{{ r.focus }}</span></div> }
            @if (r.next) { <div class="rsec next"><span class="rk">Next</span><b>{{ r.next }}</b></div> }
          } @else { <div class="dim small">The register appears when the active cell's first state patch applies.</div> }
          @if (gateLines().length) {
            <div class="rsec"><span class="rk">Harness feedback</span><div class="rlist">@for (g of gateLines(); track $index) { <div class="pl warn small">⚑ {{ g.gate }} · {{ g.text }}</div> }</div></div>
          }
        </div>
      </section>
      <section class="ticker card">
        <div class="phead"><span class="micro">Activity</span><span class="grow"></span><span class="small dim">{{ m.ticker.length }} items</span></div>
        <div class="scroll tbody" role="log" aria-live="polite">
          @for (t of ticker(); track t.seq + t.kind + $index) {
            <div class="tl" [class]="t.tone"><span class="mono dim">{{ time(t.at) }}</span><span class="tk">{{ t.kind }}</span><span class="ellipsis grow mono">{{ t.target }}</span><span class="res ellipsis">{{ t.result }}</span></div>
          } @empty { <div class="dim small">Waiting for the first event.</div> }
        </div>
      </section>
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;flex:1;min-height:0;overflow:auto}
    .rail{display:flex;align-items:center;gap:0;padding:8px 16px;border-bottom:1px solid var(--border-subtle);flex:none;overflow-x:auto}
    .stage{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:12px;border:1px solid var(--border-default);font-size:12px;color:var(--text-secondary);white-space:nowrap;background:var(--bg-surface)}
    .stage.active{border-color:var(--accent);color:var(--text-primary);background:var(--accent-faint)}
    .stage.done{color:var(--text-primary)}
    .stage.failed,.stage.blocked{border-color:color-mix(in srgb,var(--attention) 50%,var(--border-default))}
    .link{width:18px;height:1px;background:var(--border-default)}
    .seg{margin:0 8px}
    .grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;grid-template-rows:minmax(400px,60vh) minmax(240px,36vh);gap:10px;padding:10px 16px 16px}
    .card{min-height:0;display:flex;flex-direction:column}
    .canvas{padding:6px 8px;position:relative}
    .canvas as-flow-canvas{flex:1;min-height:0}
    .history{display:flex;align-items:center;gap:4px;padding:4px 6px;flex-wrap:wrap}
    .hbox{width:22px;height:18px;border-radius:3px;border:1px solid var(--border-default);background:var(--bg-canvas);font-size:10px;color:var(--text-tertiary);cursor:pointer;font-family:var(--font-mono);padding:0}
    .hbox.ok{border-color:color-mix(in srgb,var(--success) 50%,var(--border-default));color:var(--success)}
    .hbox.bad{border-color:color-mix(in srgb,var(--danger) 50%,var(--border-default));color:var(--danger)}
    .hbox.gate{box-shadow:inset 0 -2px 0 var(--attention)}
    .agent{padding:10px 12px;gap:6px;overflow:auto}
    .ahead{margin-bottom:2px}
    .who{display:flex;align-items:center;gap:7px}
    .ricon{color:var(--text-secondary)}
    .small{font-size:12px}
    .kv{margin-top:6px;row-gap:7px}
    .stack{position:relative;display:block;height:6px;border-radius:3px;background:var(--bg-active);margin:4px 0 3px}
    .stack .fill{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--accent)}
    .stack b{position:absolute;top:-3px;width:1px;height:12px;background:var(--text-tertiary)}
    .ck{display:inline-flex;align-items:center;gap:3px;margin-right:6px}
    .warn{color:var(--attention)}
    .sub{margin-top:8px}
    .reasoning,.ticker{overflow:hidden}
    .phead{display:flex;align-items:center;gap:8px;height:34px;padding:0 12px;border-bottom:1px solid var(--border-subtle);flex:none}
    .rbody{padding:8px 12px;flex:1}
    .rsec{display:grid;grid-template-columns:78px 1fr;gap:8px;padding:3px 0;font-size:12.5px}
    .rsec.next b{color:var(--text-primary)}
    .rk{color:var(--text-tertiary);font-size:11.5px;padding-top:1px}
    .rlist{display:flex;flex-direction:column;gap:3px}
    .pl{display:flex;align-items:center;gap:6px;flex-wrap:wrap;animation:fade var(--dur-base) var(--ease)}
    @keyframes fade{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
    .pl.cursor{color:var(--text-primary)} .pl.cursor .mk{color:var(--accent)}
    .pl.done .mk{color:var(--success)} .pl.todo{color:var(--text-secondary)}
    .mk{width:12px;text-align:center}
    .strike{text-decoration:line-through;color:var(--text-tertiary)}
    .tbody{flex:1;padding:4px 0}
    .tl{display:grid;grid-template-columns:58px 62px minmax(0,1fr) auto;gap:8px;padding:2px 12px;font-size:12px;align-items:center}
    .tl .tk{color:var(--text-secondary)}
    .tl.ok .res{color:var(--success)} .tl.bad .res{color:var(--danger)} .tl.warn .res{color:var(--attention)}
    .res{color:var(--text-secondary);text-align:right;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .list{font-size:12.5px}
    @media (max-width:1279px){.grid{grid-template-columns:minmax(0,1fr);grid-template-rows:auto}}
  `],
})
export class OverviewTab implements OnDestroy {
  readonly store = input.required<CampaignStore>();
  readonly summary = input<CampaignSummary | null>(null);
  private readonly app = inject(AppStore);
  private readonly router = inject(Router);
  readonly view = signal<'flow' | 'list'>((localStorage.getItem('studio.overview.view') as any) ?? 'flow');
  readonly nodes = NODES;
  private readonly now = signal(Date.now());
  private readonly timer = setInterval(() => this.now.set(Date.now()), 1000);

  readonly v = computed(() => this.store().version());
  readonly rail = computed(() => { this.v(); return this.store().model.rail(); });
  readonly live = computed(() => !!this.summary()?.live);
  readonly cell = computed(() => { this.v(); return this.store().model.activeCell(); });
  readonly turn = computed(() => { const c = this.cell(); return c?.turns.length ? c.turns[c.turns.length - 1] : null; });
  readonly turnPct = computed(() => { const t = this.turn(); const max = t?.turnsMax ?? this.cell()?.turnsMax; return t && max ? Math.min(100, t.n / max * 100) : 0; });
  readonly currentOp = computed(() => { this.v(); return this.store().model.currentOp(); });
  readonly history = computed(() => { this.v(); return this.store().model.turnHistory.slice(-12); });
  readonly ticker = computed(() => { this.v(); return [...this.store().model.ticker].reverse().slice(0, 50); });
  readonly checks = computed(() => { this.v(); return [...this.store().model.checkSummary.entries()].slice(-4); });
  readonly children = computed(() => { this.v(); return [...this.store().model.delegations.values()]; });
  readonly reg = computed(() => this.store().register()?.latest?.body ?? null);
  readonly regSize = computed(() => {
    const cap = this.app.config()?.registerCapTokens;
    const hist = this.store().register()?.historyCount;
    return hist ? `${hist} version${hist === 1 ? '' : 's'}${cap ? ' · cap ' + cap + ' tok' : ''}` : null;
  });
  readonly incTitle = computed(() => {
    const id = this.cell()?.incrementId;
    const inc = (this.store().state()?.state?.graph?.increments ?? []).find((i: any) => i.id === id);
    return inc?.title ? firstLine(inc.title, 70) : null;
  });
  readonly gateLines = computed(() => { const t = this.turn(); return t ? t.gates.slice(-3) : []; });
  readonly ctx = computed(() => {
    const t = [...(this.cell()?.turns ?? [])].reverse().find(x => x.estimatedTokens);
    const cfg = this.app.config();
    const profile = this.app.profiles().find(p => p.id === (t?.profileId ?? this.cell()?.profileId));
    const limit = profile?.profile?.capabilities?.contextLimitTokens;
    if (!t?.estimatedTokens || !limit) return null;
    return { est: t.estimatedTokens, limit, pct: Math.min(100, Math.round(t.estimatedTokens / limit * 100)), alpha: Math.round((cfg?.alpha ?? 0.65) * 100) };
  });
  readonly tokensLine = computed(() => {
    const b = this.store().budget();
    if (!b?.totals) return '—';
    const m = b.totals.money?.[0];
    return tokens(b.totals.totalTokens) + ' tok · ' + (m ? money(m.amount, m.currency, !b.totals.moneyComplete) : 'unknown');
  });
  readonly waiting = computed(() => {
    const d = this.app.decisionsFor(this.store().work);
    this.now();
    if (!d.length) return null;
    const lease = countdown(d[0].leaseExpiresAt);
    return `${d.length} decision${d.length === 1 ? '' : 's'}${lease ? ' · lease ' + lease : ''}`;
  });

  constructor() {
    effect(() => { try { localStorage.setItem('studio.overview.view', this.view()); } catch { /* ignore */ } });
    effect(() => {
      // Keep the Reasoning panel on the active cell's register (R-OVR-08).
      const c = this.cell();
      if (c && this.store().registerContext() !== c.id) this.store().selectRegister(c.id);
    });
  }

  onNode(id: string): void {
    const tab: Record<string, string> = { YOU: 'thread', CONTROLLER: 'plan', ROUTER: 'context', COMPILER: 'context', CELL: 'thread', MODEL: 'context', ATLAS: 'context', WORKSPACE: 'changes', VERIFIER: 'evidence', EVIDENCE: 'evidence', KB: 'context' };
    const summary = this.summary();
    if (id === 'YOU' && this.app.decisionsFor(this.store().work).length === 0 && summary) { this.router.navigate(['/inbox']); return; }
    if (summary) this.router.navigate(['/p', summary.projectId, 'c', summary.workId, tab[id] ?? 'thread']);
  }

  toThread(): void {
    const s = this.summary();
    if (s) this.router.navigate(['/p', s.projectId, 'c', s.workId]);
  }

  railGlyph(state: string): string {
    return ({ done: 'verified', active: 'running', pending: 'pending', failed: 'failed', blocked: 'blocked', cancelled: 'cancelled' } as any)[state] ?? 'pending';
  }
  nodeGlyph(id: NodeId): string { const s = this.store().model.nodes[id].state; return s === 'active' ? 'running' : s === 'error' ? 'failed' : s === 'attention' ? 'needs_you' : 'pending'; }
  planMark(mark: string): string { return mark === 'done' ? '✓' : mark === 'cursor' ? '▶' : mark === 'cancelled' ? '✕' : '○'; }
  roleIcon(role: string): string { return ROLE_ICON[role] ?? '▣'; }
  txt(x: any): string { return typeof x === 'string' ? x : x?.text ?? JSON.stringify(x); }
  short(id: string): string { return shortId(id, 12); }
  tok(n: number): string { return tokens(n); }
  time(iso: string): string { return clock(iso); }
  since(iso: string): string { this.now(); return duration(Date.now() - Date.parse(iso)); }
  ngOnDestroy(): void { clearInterval(this.timer); }
}
