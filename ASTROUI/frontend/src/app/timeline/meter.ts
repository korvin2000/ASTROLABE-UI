import { Limits } from '../core/model';

// The live meter of a run (ASTROLABE 2.0 C4): what it spent against its limits. The core's `budget.spent` is the
// truth — it comes before every model call and at the end, with or without limits — so the meter only shows it; time
// between two reports is drawn on while the task works. Replay follows `item.at`, never the wall clock.

export interface MeterView {
  money: { spent: string | null; unknown: boolean; estimated: boolean; limit: string | null };
  time: { ms: number; limitMin: number | null };
  requests: { n: number; limit: number | null };
  context: { used: number; limit: number | null };
  /** Some share of a limit is at 80 % or more. */
  near: boolean;
}

function num(v: unknown): number { return typeof v === 'number' ? v : typeof v === 'string' ? Number(v) || 0 : 0; }
function rec(v: unknown): Record<string, unknown> { return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}; }

export class Meter {
  limits: Limits | null = null;
  /** A `budget.spent` arrived for this run: before it, there is nothing to show. */
  reported = false;
  requests = 0;
  cost: string | null = null;
  costUnknown = false;
  costEstimated = false;
  elapsedMs = 0;
  /** When the last report was made (ms since epoch of `item.at`). */
  reportedAt = 0;
  contextUsed = 0;
  contextLimit: number | null = null;

  apply(kind: string, data: Record<string, unknown>, at: string): void {
    switch (kind) {
      case 'studio.opened': {
        const l = rec(data['limits']);
        this.limits = data['limits'] ? { moneyUsd: (l['moneyUsd'] as string | null) ?? null, minutes: (l['minutes'] as number | null) ?? null, requests: (l['requests'] as number | null) ?? null } : null;
        // A new run counts from zero; a run continued in place keeps what it spent, and the time between the runs is
        // no work: it is drawn on from this open, not from the last report.
        if (!data['resumed']) this.reset();
        else this.reportedAt = Date.parse(at) || 0;
        return;
      }
      case 'studio.user_message': {
        // A request or a follow-up starts a new run: the last run's meter stops until the new run reports.
        const role = String(data['role'] ?? '');
        if (role === 'request' || role === 'follow_up') this.reset();
        return;
      }
      case 'budget.spent': {
        const s = rec(data['status']);
        const cost = rec(s['cost']);
        this.reported = true;
        this.requests = num(s['requests']);
        this.cost = s['cost'] ? String(cost['amount'] ?? '0') : null;
        this.costUnknown = !!cost['unknown'];
        this.costEstimated = String(s['costBasis'] ?? '').toLowerCase() !== 'billed';
        this.elapsedMs = num(s['elapsedMillis']);
        this.reportedAt = Date.parse(at) || 0;
        return;
      }
      case 'cell.model_requested':
        this.contextUsed = num(data['estimatedTokens']);
        return;
    }
  }

  private reset(): void {
    this.reported = false;
    this.requests = 0;
    this.cost = null;
    this.costUnknown = false;
    this.costEstimated = false;
    this.elapsedMs = 0;
    this.reportedAt = 0;
    this.contextUsed = 0;
  }

  /** What the meter shows at [now]; [working] draws the time on since the last report. Null before the first report. */
  view(now: number, working: boolean): MeterView | null {
    if (!this.reported) return null;
    const l = this.limits ?? { moneyUsd: null, minutes: null, requests: null };
    const ms = this.elapsedMs + (working && this.reportedAt ? Math.max(0, now - this.reportedAt) : 0);
    const shares = [
      l.moneyUsd !== null && this.cost !== null ? Number(this.cost) / Number(l.moneyUsd) : 0,
      l.minutes !== null ? ms / (l.minutes * 60_000) : 0,
      l.requests !== null ? this.requests / l.requests : 0,
    ];
    return {
      money: { spent: this.cost, unknown: this.costUnknown, estimated: this.costEstimated, limit: l.moneyUsd },
      time: { ms, limitMin: l.minutes },
      requests: { n: this.requests, limit: l.requests },
      context: { used: this.contextUsed, limit: this.contextLimit },
      near: shares.some(x => x >= 0.8),
    };
  }
}
