// The product vocabulary (Studio 2 section 3, UX-1). These words name parts of the agent; they never appear in the
// default interface. The vocabulary test scans the catalogs and the templates with this list.

export const FORBIDDEN: readonly string[] = [
  'campaign', 'contract', 'cell', 'turn', 'increment', 'ledger', 'lease', 'fence', 'evidence', 'receipt', 'stamp', 'candidate',
  'workset', 'manifest', 'register', 'shape', 'D-class', 'effect class', 'ceiling', 'annex', 'attempt', 'fingerprint', 'profile',
  'qualify', 'freeze', 'routing', 'tier', 'authority', 'intent', 'reconcile', 'gate', 'nudge', 'curator', 'harness',
];

/** Patterns of internal ids and references: shapes `S0`–`S3`, work and cell ids, gap ids, spec references. */
export const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\bS[0-3]\b/,
  /\bW-[a-z0-9]{6,}/i,
  /\bcell-[a-z0-9]{4,}/i,
  /\bG-\d{2}\b/,
  /§\s?\d/,
];

/** The same internal terms in Russian, as word stems. */
export const FORBIDDEN_RU: readonly string[] = [
  'кампани', 'контракт', 'ячейк', 'инкремент', 'леджер', 'аренд', 'квитанци', 'кандидат', 'манифест', 'реестр', 'отпечат',
  'профил', 'маршрутиз', 'куратор', 'шлюз',
];

export function offencesRu(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN_RU.filter(stem => new RegExp(`(?<![\\p{L}])${stem}`, 'u').test(lower));
}

function escape(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * The forbidden words found in [text], as whole words and with their plural. "return" does not contain "turn";
 * "profiles" contains "profile".
 */
export function offences(text: string, words: readonly string[] = FORBIDDEN, patterns: readonly RegExp[] = FORBIDDEN_PATTERNS): string[] {
  const found: string[] = [];
  for (const w of words) {
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}(s|es|d|ed|ing)?(?![\\p{L}\\p{N}])`, 'iu').test(text)) found.push(w);
  }
  for (const p of patterns) if (p.test(text)) found.push(p.source);
  return found;
}
