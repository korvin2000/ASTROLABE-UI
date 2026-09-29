import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CampaignStore } from '../../state/campaign.store';
import { statusWord } from '../../core/format';
import { Glyph } from '../../ui/glyph';
import { hash8, money, tokens } from '../../core/format';

/**
 * The finish card (§5.7, §11.4): outcome, requirement statuses, acceptance at the stamp, **not verified** items,
 * attribution, budget with completeness, highest authorized stage. "Completed" needs the core outcome and receipt.
 */
@Component({
  selector: 'as-finish-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Glyph],
  template: `
    <div class="finish" [class]="tone()">
      <div class="fh">
        <as-glyph [status]="outcome()" [size]="14" />
        <span class="title">Campaign {{ word(outcome()) }}</span>
        @if (!latest()) { <span class="chip" title="A later run of this campaign (resume) ended after this one; its card below carries the receipt">earlier run</span> }
        @if (receipt()?.status && receipt()?.status !== outcome()) { <span class="chip">status {{ receipt()?.status }}</span> }
        <span class="grow"></span>
        @if (receipt(); as r) { <span class="chip mono" title="Final candidate stamp">stamp {{ hash(r.stamp) }}</span>
          <span class="chip" title="Highest stage actually authorized and reached (never 'delivered' for a patch)">highest authorized: {{ r.highestAuthorizedStage }}</span> }
      </div>
      @if (receipt(); as r) {
        <div class="grid">
          <div>
            <div class="micro">Requirements</div>
            @for (q of r.requirements ?? []; track q.id) {
              <div class="row"><as-glyph [status]="q.status" /> <span class="mono">{{ q.id }}</span> <span>{{ q.status }}</span>
                @if (q.blockers?.length) { <span class="bad">· {{ q.blockers.join('; ') }}</span> }</div>
            } @empty { <div class="dim">0 requirements defined</div> }
          </div>
          <div>
            <div class="micro">Acceptance</div>
            @for (a of r.acceptance ?? []; track a.id) {
              <div class="row"><as-glyph [status]="a.status === 'green' ? (a.currency === 'current' ? 'verified' : 'stale') : a.status" />
                <span class="mono">{{ a.id }}</span><span>{{ a.kind }} · {{ a.status }}</span>@if (a.currency) { <span class="dim">· {{ a.currency }}</span> }</div>
            }
          </div>
          <div>
            <div class="micro">Changes</div>
            <div class="row"><span class="mono">A</span> {{ r.changes?.agent?.length ?? 0 }} by the agent</div>
            <div class="row"><span class="mono">R</span> {{ r.changes?.byRun?.length ?? 0 }} by runs</div>
            <div class="row"><span class="mono">U</span> {{ r.changes?.preExistingUserChanges?.length ?? 0 }} pre-existing</div>
            @if (r.changes?.unattributed?.length) { <div class="row warn"><span class="mono">?</span> {{ r.changes.unattributed.length }} unattributed</div> }
          </div>
          <div>
            <div class="micro">Budget</div>
            <div class="row mono">{{ tok(r.budget) }} tok</div>
            <div class="row mono">{{ cost(r.budget) }}</div>
            @if (r.budget?.helperShare !== null && r.budget?.helperShare !== undefined) { <div class="row dim">helper share {{ (r.budget.helperShare * 100).toFixed(0) }}%</div> }
          </div>
        </div>
        @if (r.notVerified?.length) {
          <div class="nv"><b>Not verified</b> @for (n of r.notVerified; track $index) { <div class="mono">· {{ fmt(n) }}</div> }</div>
        }
        @if (r.decisions?.length) { <div class="more"><span class="micro">Decisions</span> @for (d of r.decisions; track $index) { <div>· {{ d }}</div> }</div> }
        @if (r.openItems?.length) { <div class="more"><span class="micro">Open items</span> @for (d of r.openItems; track $index) { <div>· {{ fmt(d) }}</div> }</div> }
      } @else if (latest()) {
        <div class="dim">The finish receipt is not available yet.</div>
      } @else {
        <div class="dim">{{ reason() ? 'Ended: ' + reason() : 'This run ended' }}. The campaign continued in a later run.</div>
      }
    </div>`,
  styles: [`
    .finish{border:1px solid var(--border-default);border-radius:8px;padding:12px 14px;margin:12px 0;background:var(--bg-surface);border-left:3px solid var(--neutral-mark)}
    .finish.ok{border-left-color:var(--success)} .finish.bad{border-left-color:var(--danger)} .finish.warn{border-left-color:var(--attention)}
    .fh{display:flex;align-items:center;gap:8px;margin-bottom:10px}
    .title{font-size:15px;font-weight:600;text-transform:capitalize}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
    .row{display:flex;align-items:center;gap:6px;font-size:12.5px}
    .nv{margin-top:10px;padding:8px 10px;border-radius:6px;background:var(--attention-subtle);color:var(--text-primary);font-size:12.5px}
    .more{margin-top:8px;font-size:12.5px;color:var(--text-secondary)}
    .warn{color:var(--attention)} .bad{color:var(--danger)}
  `],
})
export class FinishCard {
  readonly store = input.required<CampaignStore>();
  readonly outcome = input.required<string>();
  readonly reason = input<string | null>(null);
  /** Only the last finish of the stream shows the finish receipt; the receipt view always holds the latest run's. */
  readonly latest = input(true);
  readonly receipt = computed(() => this.latest() ? this.store().finish()?.receipt ?? null : null);
  readonly word = statusWord;
  readonly tone = computed(() => this.outcome() === 'completed' ? 'ok' : ['failed'].includes(this.outcome()) ? 'bad' : 'warn');

  hash(h: string): string { return hash8(h); }
  tok(b: any): string {
    const c = b?.byCacheClass ?? {};
    return tokens(Object.values(c).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0) as number);
  }
  cost(b: any): string { return b?.money ? money(b.money.amount, b.money.currency, b.money.unknown) : 'unknown'; }
  fmt(x: any): string { return typeof x === 'string' ? x : JSON.stringify(x); }
}
