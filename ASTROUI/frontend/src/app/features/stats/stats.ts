import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { AppStore } from '../../state/app.store';
import { Icon } from '../../ui/icon';
import { dateTime, money, tokens } from '../../core/format';

const DIMS = ['uncached_input', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'output'];

/**
 * Statistics (§16): every number states its coverage; unknown is "unknown", never 0 (R-STA-01); currencies are never
 * summed (R-STA-04); totals include helpers, reviews and retries (R-STA-05). Four quantities stay separate: context
 * occupancy, admission estimates, provider-reported billable dimensions and priced cost from dated tables.
 */
@Component({
  selector: 'as-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, RouterLink],
  template: `
    <div class="head">
      <as-icon name="chart" [size]="16" /><b>Statistics</b><span class="grow"></span>
      <select class="select sm" [value]="scope()" (change)="scope.set($any($event.target).value)">
        <option value="all">All projects</option>
        @for (p of app.projects(); track p.id) { <option [value]="'project:' + p.id" [selected]="'project:' + p.id === scope()">Project: {{ p.name }}</option> }
        @for (c of app.campaigns().slice(0, 30); track c.workId) { <option [value]="'campaign:' + c.workId" [selected]="'campaign:' + c.workId === scope()">Campaign: {{ (c.title ?? c.workId).slice(0, 50) }}</option> }
      </select>
      <button class="btn sm" (click)="load()"><as-icon name="refresh" [size]="13" /></button>
    </div>
    <div class="scroll body">
      @if (data(); as d) {
        <div class="tiles">
          <div class="tile card"><div class="micro">Tokens</div><div class="big mono">{{ tok(d.totals.totalTokens) }}</div><div class="small dim">{{ d.totals.coverage }}</div></div>
          <div class="tile card"><div class="micro">Money</div>
            @for (m of d.totals.money; track m.currency) { <div class="big mono">{{ fmtMoney(m.amount, m.currency, !d.totals.moneyComplete) }}</div> } @empty { <div class="big">unknown</div> }
            <div class="small dim">catalog / profile prices, not an invoice</div></div>
          <div class="tile card"><div class="micro">Model calls</div><div class="big mono">{{ d.totals.calls }}</div><div class="small dim">{{ d.totals.callsWithoutUsage }} without usage · {{ d.totals.unpricedCalls }} unpriced</div></div>
          <div class="tile card"><div class="micro">Cost per completed campaign</div>
            @for (c of d.costPerCompletedCampaign; track c.currency) { <div class="big mono">{{ fmtMoney(c.amount, c.currency, !c.complete) }}</div> } @empty { <div class="big dim">undefined</div> }
            <div class="small dim">{{ d.completedCampaigns }} completed</div></div>
        </div>
        <section class="card card-pad">
          <div class="micro">Tokens by billing dimension</div>
          <div class="stackbar">
            @for (seg of segments(); track seg.dim) { <i [class]="seg.dim" [style.width.%]="seg.pct" [title]="seg.dim + ' ' + seg.value.toLocaleString()"></i> }
          </div>
          <div class="legend">@for (seg of segments(); track seg.dim) { <span><i [class]="seg.dim"></i> {{ seg.dim }} {{ tok(seg.value) }}</span> }</div>
        </section>
        <div class="two">
          <section class="card">
            <div class="phead micro">By profile</div>
            <table class="table"><thead><tr><th>Profile</th><th>Calls</th><th>Tokens</th><th>Money</th></tr></thead><tbody>
              @for (p of profiles(); track p[0]) { <tr><td class="mono">{{ p[0] }}</td><td class="mono">{{ p[1].calls }}</td><td class="mono">{{ tok(p[1].totalTokens) }}</td><td class="mono">{{ moneyOf(p[1]) }}</td></tr> }
            </tbody></table>
          </section>
          <section class="card">
            <div class="phead micro">Outcomes and interventions</div>
            <div class="card-pad">
              @for (o of outcomes(); track o[0]) { <div class="row small"><span class="grow">{{ o[0].replaceAll('_', ' ') }}</span><span class="mono">{{ o[1] }}</span></div> }
              <div class="micro sub">Decisions</div>
              @for (i of interventions(); track i[0]) { <div class="row small"><span class="grow">{{ i[0] }}</span><span class="mono">{{ i[1].count }} · answered {{ i[1].answered }} · mean {{ i[1].meanSecondsToAnswer }} s</span></div> }
              @empty { <div class="small dim">No decisions yet.</div> }
            </div>
          </section>
        </div>
        <section class="card">
          <div class="phead micro">Campaigns</div>
          <table class="table"><thead><tr><th>Campaign</th><th>Status</th><th>Calls</th><th>Tokens</th><th>Money</th><th>Coverage</th></tr></thead><tbody>
            @for (c of d.campaigns; track c.workId) {
              <tr><td><a [routerLink]="['/p', c.projectId, 'c', c.workId]">{{ (c.title ?? c.workId).slice(0, 70) }}</a> @if (c.demo) { <span class="chip">demo</span> }</td>
                <td class="small">{{ c.status.replaceAll('_', ' ') }}</td><td class="mono">{{ c.totals.calls }}</td><td class="mono">{{ tok(c.totals.totalTokens) }}</td>
                <td class="mono">{{ moneyOf(c.totals) }}</td><td class="small dim">{{ c.totals.coverage }}</td></tr>
            }
          </tbody></table>
        </section>
        <section class="card">
          <div class="phead micro">Provider calls (telemetry · diagnostic, never added to campaign totals)</div>
          <table class="table"><thead><tr><th>At</th><th>Provider · model</th><th>Outcome</th><th>Latency</th><th>First output</th><th>Attempts</th><th>In · out</th></tr></thead><tbody>
            @for (r of d.providerCalls.slice(0, 40); track $index) {
              <tr><td class="small">{{ when(r.at) }}</td><td class="mono small">{{ r.provider }} · {{ r.model }}</td><td class="small">{{ r.outcome }}</td>
                <td class="mono small">{{ r.latencyMs }} ms</td><td class="mono small">{{ r.firstOutputMs != null ? r.firstOutputMs + ' ms' : '—' }}</td><td class="mono small">{{ r.attempts }}</td>
                <td class="mono small">{{ r.inputTokens ?? '?' }} · {{ r.outputTokens ?? '?' }}</td></tr>
            } @empty { <tr><td colspan="7" class="small dim">No provider calls recorded in this Studio yet.</td></tr> }
          </tbody></table>
        </section>
      } @else { <div class="dim pad">Loading statistics…</div> }
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .head{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-bottom:1px solid var(--border-subtle);flex:none}
    .select.sm{height:26px;max-width:420px}
    .body{flex:1;padding:14px 16px 30px;display:flex;flex-direction:column;gap:10px;max-width:1280px;width:100%;margin:0 auto}
    .tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .tile{padding:12px 14px}
    .big{font-size:20px;font-weight:600;margin:4px 0}
    .small{font-size:12px}
    .pad{padding:20px}
    .stackbar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--bg-active);margin:8px 0}
    .stackbar i,.legend i{display:inline-block;height:100%}
    .legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary)}
    .legend i{width:10px;height:8px;border-radius:2px;margin-right:4px}
    .uncached_input{background:color-mix(in srgb,var(--accent) 70%,transparent)} .cache_read{background:color-mix(in srgb,var(--success) 60%,transparent)}
    .cache_write_5m{background:color-mix(in srgb,var(--attention) 60%,transparent)} .cache_write_1h{background:color-mix(in srgb,var(--attention) 35%,transparent)}
    .output{background:color-mix(in srgb,var(--text-secondary) 60%,transparent)}
    .two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
    .phead{display:flex;align-items:center;height:34px;padding:0 12px;border-bottom:1px solid var(--border-subtle)}
    .sub{margin-top:10px}
  `],
})
export class StatsPage {
  readonly app = inject(AppStore);
  private readonly api = inject(Api);
  readonly scope = signal('all');
  readonly data = signal<any>(null);
  readonly segments = computed(() => {
    const t = this.data()?.totals?.tokens ?? {};
    const total = Object.values(t).reduce((s: number, v: any) => s + (+v || 0), 0) as number;
    return DIMS.filter(d => t[d]).map(d => ({ dim: d, value: t[d] as number, pct: total ? (t[d] / total) * 100 : 0 }));
  });
  readonly profiles = computed(() => Object.entries(this.data()?.byProfile ?? {}) as [string, any][]);
  readonly outcomes = computed(() => Object.entries(this.data()?.outcomes ?? {}) as [string, number][]);
  readonly interventions = computed(() => Object.entries(this.data()?.interventions ?? {}) as [string, any][]);

  constructor() { effect(() => { this.scope(); this.load(); }); }

  async load(): Promise<void> {
    try { this.data.set(await this.api.get('/stats?scope=' + encodeURIComponent(this.scope()))); } catch (e) { this.app.error(e, 'Statistics'); }
  }

  tok(n: number | null | undefined): string { return tokens(n); }
  fmtMoney(a: string, c: string, unknown: boolean): string { return money(a, c, unknown); }
  moneyOf(t: any): string { const m = t?.money?.[0]; return m ? money(m.amount, m.currency, !t.moneyComplete) : 'unknown'; }
  when(iso: string): string { return dateTime(iso); }
}
