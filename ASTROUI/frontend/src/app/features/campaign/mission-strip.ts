import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, OnDestroy } from '@angular/core';
import { AppStore } from '../../state/app.store';
import { CampaignStore } from '../../state/campaign.store';
import { CampaignSummary } from '../../core/model';
import { Glyph } from '../../ui/glyph';
import { countdown, money, statusWord, tokens } from '../../core/format';

/**
 * The mission strip (§4.4): live campaign summary where every element links to the view that explains it and
 * never displays a value it cannot source — missing values render "—" with the missing source named (R-SHL-03).
 */
@Component({
  selector: 'as-mission-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Glyph],
  template: `
    <div class="strip">
      <button class="seg" (click)="navigate.emit('overview')" title="Display status (store, runtime registry, pending decisions)">
        <as-glyph [status]="summary()?.pendingDecisions ? 'needs_you' : summary()?.displayStatus" [pulse]="!!summary()?.live" />
        <span class="strong">{{ status() }}</span>
      </button>
      <span class="sep"></span>
      <button class="seg" (click)="navigate.emit('plan')" [title]="incrementTip()">
        @if (increments(); as inc) { <span class="mono">{{ inc.verified }}/{{ inc.total }}</span><span class="dim">verified</span> } @else { <span class="dim">no increments yet</span> }
      </button>
      <span class="sep"></span>
      <button class="seg" (click)="navigate.emit('overview')" title="Active cell · profile · turn">
        @if (cell(); as c) {
          <span>{{ c.role }}</span><span class="dim mono">{{ c.profileId ?? '' }}</span>
          @if (turn(); as t) { <span class="mono">turn {{ t.n }}/{{ t.turnsMax ?? c.turnsMax ?? '?' }}</span> }
        } @else { <span class="dim">no cell yet</span> }
      </button>
      <span class="sep"></span>
      <button class="seg" (click)="navigate.emit('context')" title="Context occupancy from the last gauge line (not progress, R-CTX-02)">
        <span class="dim">ctx</span>
        @if (ctxPct() !== null) {
          <span class="gauge"><i [style.width.%]="ctxPct()" [class.warn]="(ctxPct() ?? 0) >= alphaPct()"></i><b [style.left.%]="alphaPct()"></b></span>
          <span class="mono">{{ ctxPct() }}%</span>
        } @else { <span class="dim" title="No gauge line yet">—</span> }
      </button>
      <span class="sep"></span>
      <button class="seg" (click)="navigate.emit('evidence')" title="Latest outcome per check (receipts)">
        @for (c of checks(); track c.id) {
          <span class="check"><as-glyph [status]="c.outcome" [size]="11" />{{ c.label }}</span>
        } @empty { <span class="dim">no checks yet</span> }
      </button>
      <span class="sep"></span>
      <button class="seg" (click)="navigate.emit('context')" [title]="budgetTip()">
        <span class="mono">{{ tokensUsed() }}</span>
        @if (tokenBudget()) { <span class="dim mono">/ {{ tokenBudget() }} tok</span> }
        <span class="mono">· {{ cost() }}</span>
      </button>
      <span class="grow"></span>
      @if (lease() && (summary()?.pendingDecisions ?? 0) > 0) {
        <span class="seg warn" title="The workspace lease keeps running while a decision waits (G-02)">lease {{ lease() }}</span>
      }
      @if ((summary()?.pendingDecisions ?? 0) > 0) {
        <button class="seg needs" (click)="navigate.emit('thread')"><as-glyph glyph="needs_you" /> {{ summary()?.pendingDecisions }} needs you</button>
      }
    </div>`,
  styles: [`
    .strip{display:flex;align-items:center;gap:2px;height:40px;padding:0 10px;border-bottom:1px solid var(--border-subtle);background:var(--bg-canvas);overflow:hidden;white-space:nowrap}
    .seg{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:0;background:none;border-radius:5px;color:var(--text-primary);cursor:pointer;font-size:12.5px;flex:none}
    .seg:hover{background:var(--bg-hover)}
    .strong{font-weight:600;text-transform:capitalize}
    .sep{width:1px;height:16px;background:var(--border-subtle)}
    .gauge{position:relative;width:54px;height:5px;border-radius:3px;background:var(--bg-active);overflow:visible}
    .gauge i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--accent)}
    .gauge i.warn{background:var(--attention)}
    .gauge b{position:absolute;top:-3px;width:1px;height:11px;background:var(--text-tertiary)}
    .check{display:inline-flex;align-items:center;gap:4px;margin-right:6px;font-size:12px}
    .warn{color:var(--attention)}
    .needs{color:var(--attention);font-weight:600}
  `],
})
export class MissionStrip implements OnDestroy {
  readonly store = input.required<CampaignStore>();
  readonly summary = input<CampaignSummary | null>(null);
  readonly navigate = output<string>();
  private readonly app = inject(AppStore);
  private readonly now = signal(Date.now());
  private readonly timer = setInterval(() => this.now.set(Date.now()), 30_000);

  readonly status = computed(() => {
    const s = this.summary();
    if (!s) return 'loading';
    return statusWord(s.displayStatus);
  });

  readonly increments = computed(() => {
    const st = this.store().state()?.state;
    const incs: any[] = st?.graph?.increments ?? [];
    if (!incs.length) return null;
    const active = incs.filter(i => i.status !== 'Cancelled');
    return { verified: active.filter(i => i.status === 'Verified').length, total: active.length };
  });

  readonly cell = computed(() => { this.store().version(); return this.store().model.activeCell(); });
  readonly turn = computed(() => { const c = this.cell(); return c && c.turns.length ? c.turns[c.turns.length - 1] : null; });
  readonly ctxPct = computed(() => {
    this.store().version();
    const g = this.store().model.lastGauge;
    const m = g?.ctx ? /(\d+)%/.exec(g.ctx) : null;
    if (m) return +m[1];
    // Admission estimate of the last request against the profile's context limit (an estimate, R-CTX-01).
    const c = this.store().model.activeCell();
    const t = [...(c?.turns ?? [])].reverse().find(x => x.estimatedTokens);
    const limit = this.app.profiles().find(p => p.id === (t?.profileId ?? c?.profileId))?.profile?.capabilities?.contextLimitTokens;
    return t?.estimatedTokens && limit ? Math.min(100, Math.round(t.estimatedTokens / limit * 100)) : null;
  });
  readonly alphaPct = computed(() => Math.round((this.app.config()?.alpha ?? 0.65) * 100));
  readonly checks = computed(() => {
    this.store().version();
    const latest = new Map<string, string>();
    for (const [id, outcome] of this.store().model.checkSummary) latest.set(id, outcome);
    const byCheck = this.store().checks()?.view?.byCheck ?? {};
    for (const [id, rows] of Object.entries(byCheck) as [string, any[]][]) latest.set(id, String(rows[rows.length - 1]?.body?.outcome ?? 'unknown').toLowerCase());
    return [...latest.entries()].map(([id, outcome]) => ({ id, label: id.replace(/^CHK-/, '').replace(/^accept-/, ''), outcome })).slice(-4);
  });
  readonly tokensUsed = computed(() => {
    const b = this.store().budget();
    if (b?.totals) return tokens(b.totals.totalTokens);
    this.store().version();
    const m = this.store().model;
    return m.tokensIn + m.tokensOut > 0 ? tokens(m.tokensIn + m.tokensOut) : '—';
  });
  readonly tokenBudget = computed(() => {
    const st = this.store().state();
    const v = st?.contract?.budget?.tokens?.value;
    return v ? tokens(v) : null;
  });
  readonly cost = computed(() => {
    const b = this.store().budget();
    const m = b?.totals?.money?.[0];
    if (!m) return b ? 'unknown' : '—';
    return money(m.amount, m.currency, !b.totals.moneyComplete);
  });
  readonly lease = computed(() => { this.now(); return countdown(this.summary()?.leaseExpiresAt); });

  incrementTip(): string { return 'Accepted requirements come from the ledger only (R-PLN-01)'; }
  budgetTip(): string {
    const b = this.store().budget();
    return b?.totals ? `Tokens by cache class (${b.totals.coverage}). Money from the attempt's dated price table; unknown is never shown as $0.` : 'Usage appears after the first model call';
  }

  ngOnDestroy(): void { clearInterval(this.timer); }
}
