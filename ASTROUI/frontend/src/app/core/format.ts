// Formatting helpers (§21.4): abbreviated token counts with exact values in tooltips, money never shown as 0 when
// unknown (R-STA-01), relative times, durations. Numbers use tabular figures via CSS.

export function tokens(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1_000) return (n / 1_000).toFixed(a >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function exact(n: number | null | undefined): string {
  return n === null || n === undefined ? 'unknown' : n.toLocaleString();
}

export function money(amount: string | number | null | undefined, currency = 'USD', unknown = false): string {
  if (amount === null || amount === undefined) return 'unknown';
  const v = typeof amount === 'string' ? parseFloat(amount) : amount;
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' ';
  const text = v < 0.01 && v > 0 ? sym + v.toFixed(4) : sym + v.toFixed(2);
  return unknown ? '≥ ' + text : text;
}

/** `"USD 0.026625"` (span cost) → formatted money, or "unknown" for null (never zero). */
export function spanCost(cost: string | null | undefined): string {
  if (!cost) return 'unknown';
  const [cur, amt] = cost.split(' ');
  return money(amt, cur);
}

export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'now';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  if (s < 86400 * 30) return Math.round(s / 86400) + 'd';
  return new Date(t).toLocaleDateString();
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { hour12: false });
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '—';
  if (ms < 1000) return ms + ' ms';
  const s = ms / 1000;
  if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + ' s';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + Math.round(s % 60) + 's';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

export function countdown(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
}

export function shortId(id: string | null | undefined, n = 8): string {
  if (!id) return '';
  if (id.startsWith('W-')) return 'W-' + id.slice(2, 2 + Math.max(4, n - 2));
  if (id.startsWith('cell-')) return 'cell-' + id.slice(5, 5 + Math.max(4, n - 4));
  return id.length > n ? id.slice(0, n) : id;
}

export function hash8(h: string | null | undefined): string {
  return h ? h.slice(0, 8) : '';
}

export function plural(n: number, one: string, many = one + 's'): string {
  return n + ' ' + (n === 1 ? one : many);
}

export function statusWord(s: string | null | undefined): string {
  if (!s) return 'unknown';
  return s.replace(/_/g, ' ');
}

export function firstLine(text: string | null | undefined, max = 140): string {
  if (!text) return '';
  const line = text.trim().split('\n')[0];
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}
