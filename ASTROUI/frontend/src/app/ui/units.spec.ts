import { describe, expect, it } from 'vitest';
import { I18n } from '../i18n/i18n';
import { usageText } from './units';

// C16 (owner №25): the spend of a task always shows a subscription model's nominal spend apart from paid spend.
const i18n = { t: (k: string, p?: Record<string, unknown>) => k + (p ? JSON.stringify(p) : '') } as unknown as I18n;

describe('usage line', () => {
  it('shows a cost as before when none of it is nominal, and says what is nominal otherwise', () => {
    const usage = { tokens: 0, elapsedMs: 5_000 };
    expect(usageText(i18n, { ...usage, cost: { amount: '0.04', currency: 'USD' } })).toBe('usage.tokens{"tokens":"0"} · $0.04 · time.s{"s":5}');
    expect(usageText(i18n, { ...usage, cost: { amount: '1.20', currency: 'USD', paidAmount: '0.00', nominalAmount: '1.20' } }))
      .toBe('usage.tokens{"tokens":"0"} · $1.20 (meter.split{"paid":"$0.00","nominal":"$1.20"}) · time.s{"s":5}');
  });
});
