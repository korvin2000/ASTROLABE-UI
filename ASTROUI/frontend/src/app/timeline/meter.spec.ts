import { describe, expect, it } from 'vitest';
import { Meter } from './meter';

// The live meter (C4): the core's budget.spent is the truth; a new run starts from zero, a continued one does not.

const limits = { moneyUsd: '10.00', minutes: 60, requests: 100 };
// C14: the core's costBasis is a wire word (`billed` · `estimated` · `mixed` · `none`).
const spent = (requests: number, amount: string | null, elapsedMillis: number, basis = 'billed') =>
  ({ status: { requests, cost: amount === null ? null : { currency: 'USD', amount, unknown: false }, costBasis: basis, elapsedMillis } });

describe('meter', () => {
  it('shows nothing before the first report', () => {
    const m = new Meter();
    m.apply('studio.opened', { limits }, '2026-10-03T10:00:00Z');
    expect(m.view(Date.parse('2026-10-03T10:00:05Z'), true)).toBeNull();
  });

  it('shows the core report against the limits and draws the time on while working', () => {
    const m = new Meter();
    m.apply('studio.opened', { limits }, '2026-10-03T10:00:00Z');
    m.apply('cell.model_requested', { estimatedTokens: 41_000 }, '2026-10-03T10:00:01Z');
    m.apply('budget.spent', spent(85, '2.50', 60_000), '2026-10-03T10:01:00Z');
    const v = m.view(Date.parse('2026-10-03T10:01:30Z'), true)!;
    expect(v.requests).toEqual({ n: 85, limit: 100 });
    expect(v.money).toEqual({ spent: '2.50', unknown: false, estimated: false, limit: '10.00' });
    expect(v.time).toEqual({ ms: 90_000, limitMin: 60 });
    expect(v.context.used).toBe(41_000);
    expect(v.near).toBe(true);
    expect(m.view(Date.parse('2026-10-03T10:01:30Z'), false)!.time.ms).toBe(60_000);
  });

  it('marks an estimate and keeps the spend of a continued run, not of a new one', () => {
    const m = new Meter();
    m.apply('studio.opened', {}, '2026-10-03T10:00:00Z');
    m.apply('budget.spent', spent(3, '0.10', 1_000, 'estimated'), '2026-10-03T10:00:10Z');
    const v = m.view(0, false)!;
    expect(v.money.estimated).toBe(true);
    expect(v.money.limit).toBeNull();
    expect(v.near).toBe(false);
    m.apply('studio.opened', { limits, resumed: true }, '2026-10-03T11:00:00Z');
    expect(m.view(0, false)!.requests).toEqual({ n: 3, limit: 100 });
    m.apply('studio.opened', { limits }, '2026-10-03T12:00:00Z');
    expect(m.view(0, false)).toBeNull();
  });

  it('reads the cost basis as a wire word and in the form stored before C14', () => {
    const m = new Meter();
    m.apply('studio.opened', { limits }, '2026-10-03T10:00:00Z');
    for (const [basis, estimated] of [['billed', false], ['mixed', true], ['none', true], ['Billed', false], ['Estimated', true]] as const) {
      m.apply('budget.spent', spent(1, '0.10', 1_000, basis), '2026-10-03T10:00:10Z');
      expect(m.view(0, false)!.money.estimated, basis).toBe(estimated);
    }
  });

  it('draws the time of a continued run from its open, not across the pause (review P2)', () => {
    const m = new Meter();
    m.apply('studio.opened', { limits }, '2026-10-03T10:00:00Z');
    m.apply('budget.spent', spent(10, '1.00', 60_000), '2026-10-03T10:01:00Z');
    m.apply('studio.opened', { limits, resumed: true }, '2026-10-03T15:00:00Z');
    expect(m.view(Date.parse('2026-10-03T15:00:10Z'), true)!.time.ms).toBe(70_000);
  });

  it('stops the last run on a follow-up until the new run reports', () => {
    const m = new Meter();
    m.apply('studio.opened', { limits }, '2026-10-03T10:00:00Z');
    m.apply('budget.spent', spent(10, '1.00', 60_000), '2026-10-03T10:01:00Z');
    m.apply('studio.user_message', { role: 'message' }, '2026-10-03T10:02:00Z');
    expect(m.view(0, false)).not.toBeNull();
    m.apply('studio.user_message', { role: 'follow_up' }, '2026-10-03T12:00:00Z');
    expect(m.view(Date.parse('2026-10-03T12:00:30Z'), true)).toBeNull();
  });
});
