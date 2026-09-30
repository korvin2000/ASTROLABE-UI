import { money, tokens } from '../core/format';
import { I18n } from '../i18n/i18n';

/** "1 min 12 s": a duration in the words of the catalog. */
export function elapsed(i18n: I18n, ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return i18n.t('time.s', { s });
  const m = Math.floor(s / 60);
  if (m < 60) return i18n.t('time.min_s', { min: m, s: s % 60 });
  return i18n.t('time.h_min', { h: Math.floor(m / 60), min: m % 60 });
}

/** "0.2 s" for a step; steps shorter than a tenth of a second show nothing. */
export function stepTime(i18n: I18n, from: string, to: string | undefined): string {
  if (!to) return '';
  const ms = Date.parse(to) - Date.parse(from);
  if (isNaN(ms) || ms < 100) return '';
  if (ms < 60_000) return i18n.t('time.s', { s: (ms / 1000).toFixed(ms < 10_000 ? 1 : 0) });
  return elapsed(i18n, ms);
}

/** "0:42": the clock of the status line. */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** "18.4k tokens · $0.04 · 1 min 12 s": what a task used; the cost only when it is known. */
export function usageText(i18n: I18n, usage: { tokens: number; cost?: { amount: string; currency: string }; elapsedMs: number } | undefined | null): string {
  if (!usage) return '';
  const parts = [i18n.t('usage.tokens', { tokens: tokens(usage.tokens).toLowerCase() })];
  if (usage.cost) parts.push(money(usage.cost.amount, usage.cost.currency));
  const time = elapsed(i18n, usage.elapsedMs);
  if (time) parts.push(time);
  return parts.join(' · ');
}
