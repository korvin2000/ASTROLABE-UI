import { describe, expect, it } from 'vitest';
import { CampaignModel } from './campaign-model';
import { parseEnvelope, parseGauge } from '../core/envelope';
import { StudioItem } from '../core/model';
import recorded from '../../testing/interactive-campaign.events.json';

// Golden input (§24.3 cassettes): the Studio event log of the interactive fixture campaign — one question answered
// "Round to cents", one D-class approval, one verified increment — as served by GET /campaigns/{work}/events.
const items = recorded as unknown as StudioItem[];
const WORK = items[0].ids?.work ?? 'W-test';

function replay(stream: StudioItem[]): CampaignModel {
  const m = new CampaignModel(WORK);
  for (const i of stream) m.apply(i);
  return m;
}

/** What the views read from the model; two replays are equivalent when these agree. */
function digest(m: CampaignModel) {
  const cells = m.cellOrder.map(id => m.cells.get(id)!);
  return {
    lastSeq: m.lastSeq,
    items: m.items.length,
    blocks: m.blocks.map(b => b.type + ':' + b.seq),
    outcome: m.outcome,
    shape: m.shape,
    cells: cells.map(c => ({ status: c.status, turns: c.turns.length, ops: c.turns.map(t => t.ops.length) })),
    questions: [...m.questions.values()].map(q => q.answered),
    increments: [...m.increments.values()].map(i => i.state),
    edits: m.editCount,
    checks: [...m.checkSummary.entries()],
    tokens: [m.tokensIn, m.tokensOut, m.modelCalls],
  };
}

describe('CampaignModel replay of a recorded interactive campaign', () => {
  const model = replay(items);

  it('reaches the recorded end state', () => {
    expect(model.lastSeq).toBe(items[items.length - 1].seq);
    expect(model.outcome).toBe('completed');
    expect(model.shape).toBe('S0');
    expect(model.runEnded).not.toBeNull();
    expect(model.cellOrder).toHaveLength(1);
    const cell = model.cells.get(model.cellOrder[0])!;
    expect(cell.status).toBe('completed');
    expect(cell.turns).toHaveLength(items.filter(i => i.kind === 'cell.turn_started').length);
    expect([...model.increments.values()].map(i => i.state)).toEqual(['verified']);
    expect([...model.questions.values()].every(q => q.answered)).toBe(true);
    expect(model.editCount).toBe(1);
    expect(model.modelCalls).toBe(items.filter(i => i.kind === 'cell.model_responded').length);
  });

  it('is idempotent under at-least-once delivery (duplicates and stale redeliveries are ignored)', () => {
    const noisy: StudioItem[] = [];
    items.forEach((item, k) => {
      noisy.push(item, item);
      if (k > 3) noisy.push(items[k - 3]);
    });
    expect(digest(replay(noisy))).toEqual(digest(model));
  });

  it('gives the same state whether items arrive in one batch or across a reconnect', () => {
    const cut = Math.floor(items.length / 2);
    const m = replay(items.slice(0, cut));
    // A reconnect resumes from the last applied seq; the server may resend a few items before it.
    for (const i of items.slice(cut - 5)) m.apply(i);
    expect(digest(m)).toEqual(digest(model));
  });

  it('never stores ephemeral progress (no seq) as history', () => {
    const m = replay(items.slice(0, 20));
    const before = digest(m);
    m.apply({ kind: 'cell.model_progress', source: 'bus', at: new Date().toISOString(), ids: { work: WORK }, cell: m.cellOrder[0], data: { stage: 'generating', textChars: 42 } } as StudioItem);
    expect(m.lastSeq).toBe(before.lastSeq);
    expect(m.items).toHaveLength(before.items);
  });
});

describe('envelope and gauge parsers', () => {
  it('reads a result header verbatim and keeps unknown fields as flags', () => {
    const env = parseEnvelope('⟦result #3 tool=run class=D v={src/a.py:1a2b,README.md:ffee} status=ok effects=none extra=1⟧ body');
    expect(env).not.toBeNull();
    expect(env!.alias).toBe('#3');
    expect(env!.tool).toBe('run');
    expect(env!.cls).toBe('D');
    expect(env!.status).toBe('ok');
    expect(env!.versions).toEqual({ 'src/a.py': '1a2b', 'README.md': 'ffee' });
    expect(env!.flags).toContain('extra=1');
  });

  it('returns null for text without a header instead of guessing', () => {
    expect(parseEnvelope('plain text')).toBeNull();
    expect(parseEnvelope(null)).toBeNull();
    expect(parseGauge('')).toBeNull();
  });
});
