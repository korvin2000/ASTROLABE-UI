import { money, tokens } from '../../core/format';
import { Approach, Limits } from '../../core/model';
import { MeterView } from '../../timeline/meter';
import { clockOf } from '../../ui/units';

// The limits of a run and its approach (ASTROLABE 2.0 C4): money in US dollars, minutes of active work, requests to the
// model; null is no limit. They count per run. Pure, so the rules are tested without a view.

export type LimitKind = 'money' | 'minutes' | 'requests';

/** Owner 2026-10-03: generous defaults — hard tasks run for hours and make thousands of requests. */
export const DEFAULT_LIMITS: Limits = { moneyUsd: '50.00', minutes: 480, requests: 3000 };
export const APPROACHES: Approach[] = ['economy', 'balanced', 'thorough'];
export const NO_LIMITS: Limits = { moneyUsd: null, minutes: null, requests: null };

type T = (key: string, params?: Record<string, unknown>) => string;

/** Money as `$50` or `$7.50`. */
export function dollars(amount: string | number): string {
  const v = typeof amount === 'string' ? parseFloat(amount) : amount;
  return '$' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

/** A time limit in hours from 120 minutes on, else in minutes. */
export function minutesText(t: T, minutes: number): string {
  return minutes >= 120 ? t('limit.short_hours', { n: Math.round((minutes / 60) * 10) / 10 }) : t('limit.short_minutes', { n: minutes });
}

/** "$50 · 8 h · requests: 3000", or "No limits". */
export function limitsText(t: T, l: Limits | null | undefined): string {
  if (!l) return '';
  const parts: string[] = [];
  if (l.moneyUsd !== null) parts.push(dollars(l.moneyUsd));
  if (l.minutes !== null) parts.push(minutesText(t, l.minutes));
  if (l.requests !== null) parts.push(t('limit.short_requests', { n: l.requests }));
  return parts.length ? parts.join(' · ') : t('limit.no_limits');
}

/** A field of the limits menu: empty is no limit (null); anything else must be a positive number, or it is invalid (undefined). */
export function parseLimit(kind: LimitKind, text: string): string | number | null | undefined {
  const v = text.trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (kind === 'money') return n > 10_000 ? undefined : n.toFixed(2);
  if (!Number.isInteger(n)) return undefined;
  return n > (kind === 'minutes' ? 10_080 : 100_000) ? undefined : n;
}

/** The limit of [kind] as a number, null for none. */
export function valueOf(l: Limits, kind: LimitKind): number | null {
  const v = kind === 'money' ? l.moneyUsd : kind === 'minutes' ? l.minutes : l.requests;
  return v === null || v === undefined ? null : Number(v);
}

/** [l] with the reached limit of [kind] doubled (money to the cent); no limit stays none. */
export function raised(l: Limits, kind: LimitKind): Limits {
  const v = valueOf(l, kind);
  if (v === null) return { ...l };
  if (kind === 'money') return { ...l, moneyUsd: (v * 2).toFixed(2) };
  return kind === 'minutes' ? { ...l, minutes: Math.min(v * 2, 10_080) } : { ...l, requests: Math.min(v * 2, 100_000) };
}

/** True when [next] lifts the limit of [kind] of [before]: gone, or higher. */
export function raises(next: Limits, before: Limits, kind: LimitKind): boolean {
  const now = valueOf(next, kind);
  const was = valueOf(before, kind);
  return now === null || (was !== null && now > was);
}

/** The kind of a user's limit a pause reason names (`limit_money` …), or null. */
export function limitKindOf(code: string | undefined | null): LimitKind | null {
  return code === 'limit_money' ? 'money' : code === 'limit_minutes' ? 'minutes' : code === 'limit_requests' ? 'requests' : null;
}

/** "$0.42 / $50.00 · 12:40 / 8 h · 37 / 3000 requests · context 41K / 200K"; a part without a limit shows the spend only. */
export function meterText(t: T, v: MeterView): string {
  const m = v.money;
  const spent = m.spent === null ? t('meter.money_unknown') : (m.unknown ? '≥ ' : m.estimated ? '≈ ' : '') + money(m.spent);
  const split = m.nominal ? ' (' + t('meter.split', { paid: money(m.paid ?? '0'), nominal: money(m.nominal) }) + ')' : '';
  const parts = [(m.limit !== null ? spent + ' / ' + money(m.limit) : spent) + split];
  const clock = clockOf(v.time.ms / 1000);
  parts.push(v.time.limitMin !== null ? clock + ' / ' + minutesText(t, v.time.limitMin) : clock);
  parts.push(v.requests.limit !== null ? t('meter.requests', { n: v.requests.n, limit: v.requests.limit }) : t('meter.requests_free', { n: v.requests.n }));
  if (v.context.used > 0) {
    parts.push(v.context.limit ? t('meter.context', { used: tokens(v.context.used), limit: tokens(v.context.limit) }) : t('meter.context_free', { used: tokens(v.context.used) }));
  }
  if (m.unpriced) parts.push(t('meter.unpriced', { n: m.unpriced }));
  return parts.join(' · ');
}
