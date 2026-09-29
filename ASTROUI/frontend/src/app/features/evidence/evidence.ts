import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CampaignStore } from '../../state/campaign.store';
import { CampaignSummary } from '../../core/model';
import { Inspector } from '../shell/inspector';
import { Glyph } from '../../ui/glyph';
import { Icon } from '../../ui/icon';
import { dateTime, hash8, money, tokens } from '../../core/format';

type Segment = 'acceptance' | 'checks' | 'receipts' | 'finish';

/**
 * Evidence (§11): acceptance with currency, checks, receipts and the finish receipt. A green mark means "current
 * receipt at the current stamp" (R-EVD-01); inconclusive, not_run and unavailable never render as passed (R-EVD-02);
 * outcomes are verbatim (R-EVD-03); "Request check" is not offered (G-33).
 */
@Component({
  selector: 'as-evidence-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Glyph, Icon],
  template: `
    <div class="bar">
      <div class="seg">
        @for (s of segments; track s.key) { <button [class.on]="segment() === s.key" (click)="segment.set(s.key)">{{ s.label }}</button> }
      </div>
      <span class="grow"></span>
      <span class="small dim">Checks run when the harness schedules them — a user-requested check run is not available (G-33).</span>
    </div>
    <div class="scroll body">
      @switch (segment()) {
        @case ('acceptance') {
          @for (r of requirements(); track r.id) {
            <div class="req card">
              <div class="rowline"><as-glyph [status]="r.status" /><span class="mono b">{{ r.id }}</span><span class="status">{{ r.status }}</span><span class="grow text">{{ r.text }}</span>
                @if (r.evidence.length) { <span class="small dim mono">ledger: {{ r.evidence.join(', ') }} · stamp {{ r.stampValid ? 'valid' : 'moved' }}</span> }</div>
              @for (a of r.acceptance; track a.id) {
                <div class="acc rowline">
                  <span class="kicon">{{ a.type === 'run' ? '▶' : a.type === 'check' ? '☑' : '⚖' }}</span>
                  <span class="mono">{{ a.id }}</span>
                  <span class="grow mono small ellipsis" [title]="a.criterion">{{ a.criterion }}</span>
                  <span class="chip">{{ a.origin }}</span>
                  @if (a.ev; as e) {
                    <as-glyph [status]="e.glyph" [size]="11" /><span class="small mono">{{ e.status }}</span>
                    @if (e.currency) { <span class="small" [class.warn]="e.currency !== 'current'">· {{ e.currency }}</span> }
                    @if (e.receipt) { <button class="btn ghost sm" (click)="openReceipt(e.receipt)">{{ e.receipt }}</button> }
                  } @else { <span class="small dim">not run yet</span> }
                </div>
              }
            </div>
          } @empty { <div class="dim pad">No requirements yet.</div> }
        }
        @case ('checks') {
          <table class="table">
            <thead><tr><th>Check</th><th>Last outcome</th><th>Receipts</th><th>Last stamp</th><th>Acceptance</th><th>Counts</th></tr></thead>
            <tbody>
              @for (c of checks(); track c.id) {
                <tr class="clickable" (click)="openReceipt(c.last?.receiptId)">
                  <td class="mono">{{ c.id }}</td>
                  <td><as-glyph [status]="c.outcome" [size]="11" /> <span class="mono">{{ c.outcome }}</span></td>
                  <td class="mono">{{ c.count }}</td>
                  <td class="mono">{{ hash(c.last?.stampAfter) }}</td>
                  <td class="mono">{{ (c.last?.acceptanceIds ?? []).join(', ') }}</td>
                  <td class="mono small">{{ counts(c.last?.parsed) }}</td>
                </tr>
              } @empty { <tr><td colspan="6" class="dim">No receipts yet.</td></tr> }
            </tbody>
          </table>
        }
        @case ('receipts') {
          <table class="table">
            <thead><tr><th>Receipt</th><th>Check</th><th>Outcome</th><th>Counts</th><th>Stamp before → after</th><th>Recorded</th></tr></thead>
            <tbody>
              @for (r of receipts(); track r.receiptId) {
                <tr class="clickable" (click)="openReceipt(r.receiptId)">
                  <td class="mono">{{ r.receiptId }}</td><td class="mono">{{ r.checkId }}</td>
                  <td><as-glyph [status]="r.outcome" [size]="11" /> <span class="mono">{{ r.outcome }}</span></td>
                  <td class="mono small">{{ counts(r.body?.parsed) }}</td>
                  <td class="mono">{{ hash(r.stampBefore) }} → {{ hash(r.stampAfter) }}</td>
                  <td class="small">{{ when(r.createdAt) }}</td>
                </tr>
              } @empty { <tr><td colspan="6" class="dim">No receipts yet.</td></tr> }
            </tbody>
          </table>
        }
        @case ('finish') {
          @if (store().finish()?.receipt; as f) {
            <div class="fgrid">
              <div class="card card-pad"><div class="micro">Outcome</div><div class="big">{{ f.outcome }}</div><div class="small dim">status {{ f.status }} · contract v{{ f.contractVersion }} · stamp {{ hash(f.stamp) }}</div>
                @if (f.reason) { <div class="small">{{ f.reason }}</div> }</div>
              <div class="card card-pad"><div class="micro">Budget</div><div class="big">{{ tok(f.budget) }}</div><div class="small">{{ cost(f.budget) }}</div>
                <div class="small dim">@for (e of cacheClasses(f.budget); track e[0]) { {{ e[0] }} {{ e[1] }} · }</div></div>
              <div class="card card-pad"><div class="micro">Publication</div><div class="big">{{ f.highestAuthorizedStage }}</div><div class="small dim">highest authorized stage</div></div>
            </div>
            <div class="card card-pad sec"><div class="micro">Checks run</div>
              @for (c of f.checksRun ?? []; track c.receiptId) { <div class="rowline small"><as-glyph [status]="c.outcome" [size]="11" /><span class="mono">{{ c.checkId }}</span><span class="mono dim">{{ c.receiptId }}</span><span>{{ c.outcome }}</span><span class="dim">verifier {{ c.verifierVersion }}</span></div> }
            </div>
            <div class="card card-pad sec"><div class="micro">Not verified</div>
              @for (n of f.notVerified ?? []; track $index) { <div class="small">· {{ fmt(n) }}</div> } @empty { <div class="small dim">nothing left unverified</div> }
            </div>
            @if (f.deadEnds?.length || f.decisions?.length || f.openItems?.length) {
              <div class="card card-pad sec">
                @if (f.decisions?.length) { <div class="micro">Decisions</div> @for (d of f.decisions; track $index) { <div class="small">· {{ fmt(d) }}</div> } }
                @if (f.deadEnds?.length) { <div class="micro">Dead ends</div> @for (d of f.deadEnds; track $index) { <div class="small">· {{ fmt(d) }}</div> } }
                @if (f.openItems?.length) { <div class="micro">Open items</div> @for (d of f.openItems; track $index) { <div class="small">· {{ fmt(d) }}</div> } }
              </div>
            }
            <button class="btn sm" (click)="raw(f)"><as-icon name="file" [size]="13" /> Raw finish receipt</button>
          } @else {
            <div class="empty"><as-icon name="shield" [size]="22" /><span>{{ store().finish()?.reason ?? 'No finish receipt yet — it is written when the campaign finishes.' }}</span></div>
          }
        }
      }
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;flex:1;min-height:0}
    .bar{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border-subtle);flex:none}
    .body{flex:1;padding:12px 16px 20px}
    .req{padding:8px 12px;margin-bottom:8px}
    .rowline{display:flex;align-items:center;gap:8px;min-width:0;padding:2px 0}
    .acc{padding-left:22px}
    .b{font-weight:500;white-space:nowrap} .status{font-size:12px;color:var(--text-secondary)}
    .text{min-width:0;overflow-wrap:anywhere}
    .kicon{width:14px;text-align:center;color:var(--text-secondary)}
    .small{font-size:12px}
    .warn{color:var(--attention)}
    .pad{padding:16px}
    .fgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px}
    .big{font-size:18px;font-weight:600;text-transform:capitalize;margin:4px 0}
    .sec{margin-bottom:10px}
  `],
})
export class EvidenceTab {
  readonly store = input.required<CampaignStore>();
  readonly summary = input<CampaignSummary | null>(null);
  private readonly inspector = inject(Inspector);
  readonly segment = signal<Segment>('acceptance');
  readonly segments: { key: Segment; label: string }[] = [
    { key: 'acceptance', label: 'Acceptance' }, { key: 'checks', label: 'Checks' }, { key: 'receipts', label: 'Receipts' }, { key: 'finish', label: 'Finish receipt' },
  ];

  readonly receipts = computed(() => [...(this.store().checks()?.receipts ?? [])].reverse() as any[]);
  readonly checks = computed(() => {
    const byCheck = this.store().checks()?.view?.byCheck ?? {};
    return Object.entries(byCheck).map(([id, rows]: [string, any]) => {
      const last = rows[rows.length - 1]?.body;
      return { id, count: rows.length, last, outcome: String(last?.outcome ?? 'unknown').toLowerCase() };
    });
  });

  readonly requirements = computed(() => {
    const contract = this.store().contract()?.view?.contracts?.slice(-1)[0]?.body;
    if (!contract) return [];
    const ledger = this.store().state()?.state?.ledger?.entries ?? {};
    const finish = this.store().finish()?.receipt;
    return (contract.requirements ?? []).map((r: any) => {
      const e = ledger[r.id];
      return {
        id: r.id, text: r.text, status: String(e?.status ?? 'pending').toLowerCase(), evidence: e?.evidence ?? [], stampValid: e?.stampValid ?? false,
        acceptance: (r.acceptance ?? []).map((aid: string) => {
          const a = contract.acceptance.find((x: any) => x.id === aid) ?? { id: aid };
          const fa = finish?.acceptance?.find((x: any) => x.id === aid);
          const rc = this.receipts().find(x => (x.body?.acceptanceIds ?? []).includes(aid));
          const ev = fa ? { status: fa.status, currency: fa.currency, glyph: fa.status === 'green' ? (fa.currency === 'current' ? 'verified' : 'stale') : fa.status, receipt: rc?.receiptId ?? null }
            : rc ? { status: String(rc.outcome).toLowerCase(), currency: null, glyph: String(rc.outcome).toLowerCase(), receipt: rc.receiptId } : null;
          return { id: aid, type: a.type, criterion: a.type === 'run' ? (a.command?.argv ?? []).join(' ') : a.text ?? '', origin: this.origin(a.origin), ev };
        }),
      };
    });
  });

  origin(o: any): string { return !o ? '—' : o.type === 'model' ? 'model · strengthens ' + o.strengthens : o.type === 'amended' ? 'amended@v' + o.version : o.type; }
  counts(p: any): string { return p ? `${p.passed} passed · ${p.failed} failed${p.errors ? ' · ' + p.errors + ' errors' : ''}${p.discovered === 0 ? ' · 0 discovered' : ''}` : '—'; }
  hash(h: string | null | undefined): string { return hash8(h); }
  when(iso: string): string { return dateTime(iso); }
  tok(b: any): string { const c = b?.byCacheClass ?? {}; return tokens(Object.values(c).reduce((s: number, v: any) => s + (+v || 0), 0) as number) + ' tok'; }
  cost(b: any): string { return b?.money ? money(b.money.amount, b.money.currency, b.money.unknown) : 'unknown'; }
  cacheClasses(b: any): [string, string][] { return Object.entries(b?.byCacheClass ?? {}).map(([k, v]) => [k, tokens(v as number)]); }
  fmt(x: any): string { return typeof x === 'string' ? x : JSON.stringify(x); }

  openReceipt(id: string | null | undefined): void {
    if (!id) return;
    const row = this.receipts().find(r => r.receiptId === id);
    const s = this.summary();
    if (row && s) this.inspector.open({ type: 'receipt', work: this.store().work, projectId: s.projectId, receipt: { ...row.body, rawBlob: row.rawBlob } });
  }

  raw(f: any): void { this.inspector.open({ type: 'json', title: 'Finish receipt', data: f }); }
}
