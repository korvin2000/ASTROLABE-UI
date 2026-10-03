import { describe, expect, it } from 'vitest';
import { StudioItem } from '../core/model';
import { translate } from '../i18n/translate';
import legacy from '../../testing/interactive-campaign.events.json';
import auto from '../../testing/task-auto.events.json';
import followUp from '../../testing/task-follow-up.events.json';
import live from '../../testing/task-live-openrouter.events.json';
import paused from '../../testing/task-live-paused.events.json';
import asked from '../../testing/task-question-approval.events.json';
import { FORBIDDEN, offences } from '../vocabulary';
import { FlowModel } from '../features/panel/flow/flow-model';
import { Item, Timeline, summarize } from './timeline';

// Replays of recorded event logs (Studio 2 FE-6): the demo runs of the test backend and the live runs of spike S-3.

interface Recording { task: { state: string; verified: string }; runs: string[]; items: StudioItem[]; }

function replay(items: StudioItem[]): Timeline {
  const t = new Timeline();
  for (const i of items) t.apply(i);
  return t;
}

const rec = (r: unknown) => r as Recording;
const types = (t: Timeline) => t.items.map(i => i.type);
const of = <T extends Item['type']>(t: Timeline, type: T) => t.items.filter(i => i.type === type) as Extract<Item, { type: T }>[];

/** Every text of the timeline that comes from the catalog, in English. */
function texts(t: Timeline): string[] {
  const out: string[] = [];
  for (const i of t.items) {
    if (i.type === 'notice') out.push(translate('en', i.text.key, i.text.params));
    if (i.type === 'activity') for (const s of i.steps) out.push(translate('en', s.text.key, s.text.params));
  }
  return out;
}

describe('a task with a question and an approval', () => {
  const t = replay(rec(asked).items);

  it('starts with the user message and ends with the result', () => {
    expect(t.items[0]).toMatchObject({ type: 'user', role: 'request' });
    expect(t.items.at(-1)?.type).toBe('result');
    expect(t.state).toBe('done');
    expect(t.stage).toBe(5);
  });

  it('shows the question and the approval as cards, collapsed once answered', () => {
    const cards = of(t, 'card');
    expect(cards.map(c => c.card.kind)).toEqual(['question', 'approval']);
    expect(cards[0].status).toBe('answered');
    expect(cards[0].answer).toBe('Round to cents (2 decimals)');
    expect(cards[1].decision).toBe('allowed');
    expect(cards[1].card.command).toContain('git log');
    expect(cards[1].card.effect).toBe('protected');
    expect(t.pending()).toEqual([]);
  });

  it('does not repeat the typed answer as a message', () => {
    expect(of(t, 'user')).toHaveLength(1);
  });

  it('names the verification once, as a notice', () => {
    const notices = of(t, 'notice').filter(n => n.text.key === 'notice.checks_tests');
    expect(notices).toHaveLength(1);
    expect(notices[0].text.params?.['command']).toContain('unittest');
  });

  it('turns tool calls into steps with their file or command', () => {
    const steps = of(t, 'activity').flatMap(a => a.steps);
    expect(steps.some(s => s.text.key === 'step.read' && s.path === 'src/shop/pricing.py')).toBe(true);
    expect(steps.some(s => s.text.key === 'step.edit' && s.path === 'src/shop/pricing.py' && s.status === 'ok')).toBe(true);
    expect(steps.some(s => s.text.key === 'step.run' && String(s.command).startsWith('git log'))).toBe(true);
    expect(steps.every(s => s.status !== 'running')).toBe(true);
    // The agent's own bookkeeping is never a step.
    expect(steps.some(s => s.tool === 'state' || s.tool === 'task')).toBe(false);
  });

  it('reports the checks that passed', () => {
    const checks = of(t, 'checks');
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every(c => c.passed)).toBe(true);
  });

  it('uses the last words of the agent as the summary of the result', () => {
    const result = of(t, 'result')[0];
    expect(result.summary).toContain('tests pass');
    expect(of(t, 'agent').some(a => a.text === result.summary)).toBe(false);
  });

  it('closes every activity group at the end', () => {
    expect(of(t, 'activity').every(a => !a.live)).toBe(true);
    expect(t.status).toBeNull();
  });

  it('counts tokens and model calls', () => {
    expect(t.modelCalls).toBeGreaterThan(3);
    expect(t.tokens).toBeGreaterThan(1000);
  });
});

describe('redelivery and replay', () => {
  const items = rec(asked).items;

  it('ignores items it has seen', () => {
    const once = replay(items);
    const twice = replay([...items, ...items.slice(10, 40), ...items]);
    expect(types(twice)).toEqual(types(once));
    expect(twice.tokens).toBe(once.tokens);
  });

  it('gives the same conversation whether history arrives whole or in two parts', () => {
    const whole = replay(items);
    const t = new Timeline();
    for (const i of items.slice(0, 50)) t.apply(i);
    for (const i of items.slice(45)) t.apply(i);
    expect(types(t)).toEqual(types(whole));
  });

  it('shows a waiting card while the question is open', () => {
    const upTo = items.findIndex(i => i.kind === 'studio.decision_requested');
    const t = replay(items.slice(0, upTo + 1));
    expect(t.state).toBe('needs_you');
    expect(t.pending()).toHaveLength(1);
    expect(t.pending()[0].card.kind).toBe('question');
  });

  it('keeps the waiting card last: what the agent did before it asked stands above it, finished', () => {
    const asked = items.findIndex(i => i.kind === 'studio.decision_requested');
    const told = items.findIndex((i, n) => n > asked && i.kind === 'journal.call');
    const t = replay(items.slice(0, told + 1));
    expect(types(t).slice(-3)).toEqual(['agent', 'activity', 'card']);
    const steps = of(t, 'activity').flatMap(a => a.steps);
    expect(steps.map(s => s.status)).toEqual(['ok', 'ok']);
  });
});

describe('a task in auto mode', () => {
  const t = replay(rec(auto).items);

  it('has no cards: the host answered', () => {
    expect(of(t, 'card')).toEqual([]);
    expect(t.state).toBe('done');
  });

  it('puts what the host decided below the words of the agent that led to it', () => {
    const list = t.items;
    const assumed = list.findIndex(i => i.type === 'notice' && i.text.key === 'notice.auto_assumed');
    const skipped = list.findIndex(i => i.type === 'notice' && i.text.key === 'notice.auto_skipped');
    expect(list[assumed - 1].type).toBe('activity');
    expect(list[skipped - 1].type).toBe('activity');
    expect(list.slice(0, assumed).some(i => i.type === 'agent')).toBe(true);
  });

  it('says what it assumed and what it skipped', () => {
    const keys = of(t, 'notice').map(n => n.text.key);
    expect(keys).toContain('notice.auto_assumed');
    expect(keys).toContain('notice.auto_skipped');
  });
});

describe('a task with a follow-up run', () => {
  const r = rec(followUp);
  const t = replay(r.items);

  it('is one conversation over two runs', () => {
    expect(r.runs).toHaveLength(2);
    expect(of(t, 'user').map(u => u.role)).toEqual(['request', 'follow_up']);
    expect(of(t, 'result')).toHaveLength(2);
    expect(of(t, 'result').map(x => x.workId)).toEqual(r.runs);
  });

  it('shows the words of the user, not the recap the agent was given', () => {
    expect(of(t, 'user')[1].text).toBe('Now also create notes.md');
  });

  it('says that a review pass verified the result', () => {
    const keys = of(t, 'notice').map(n => n.text.key);
    expect(keys).toContain('notice.checks_review');
    expect(keys).toContain('notice.review_passed');
  });

  it('shows the created files as steps', () => {
    const paths = of(t, 'activity').flatMap(a => a.steps).filter(s => s.text.key === 'step.create').map(s => s.path);
    expect(paths).toEqual(['hello.txt', 'notes.md']);
  });
});

describe('live runs (spike S-3)', () => {
  it('a run that finished ends with a result', () => {
    const t = replay(rec(live).items);
    expect(t.state).toBe('done');
    expect(of(t, 'result')).toHaveLength(1);
    expect(of(t, 'activity').flatMap(a => a.steps).some(s => s.text.key === 'step.create' && s.path === 'hello.py')).toBe(true);
  });

  it('a run the agent could not finish ends paused, with its reason on a card', () => {
    const t = replay(rec(paused).items);
    expect(t.state).toBe('paused');
    const errors = of(t, 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].error.code).toBe('blocked');
    expect(errors[0].error.detail).toContain('hello.py');
    // Steps that were refused show as failed, never as running.
    const steps = of(t, 'activity').flatMap(a => a.steps);
    expect(steps.some(s => s.status === 'running')).toBe(false);
  });
});

describe('robustness (FE-6)', () => {
  it('keeps unknown kinds for the technical view and goes on', () => {
    const t = new Timeline();
    const base = { at: '2026-09-29T10:00:00Z', source: 'bus' as const, ids: { work: 'W-x' } };
    t.apply({ ...base, seq: 1, kind: 'studio.user_message', data: { text: 'hello', role: 'request' } });
    t.apply({ ...base, seq: 2, kind: 'something.new', data: { a: 1 } });
    t.apply({ ...base, seq: 3, kind: 'journal.call', data: { payload: 'not a list' } });
    t.apply({ ...base, seq: 4, kind: 'journal.call', data: { payload: [{ type: 'tool_call', id: 'c1', name: 'look', argsJson: '{broken' }] } });
    t.apply({ ...base, seq: 5, kind: 'studio.error', data: { code: 'never_heard_of', detail: 'raw reason' } });
    expect(t.technical.map(i => i.kind)).toContain('something.new');
    expect(types(t)).toEqual(['user', 'activity', 'error']);
    expect(of(t, 'error')[0].error.detail).toBe('raw reason');
  });

  it('surfaces a model error', () => {
    const t = new Timeline();
    t.apply({ at: '2026-09-29T10:00:00Z', source: 'bus', ids: { work: 'W-x' }, seq: 1, kind: 'cell.model_responded', data: { error: { code: 'rate_limited', message: 'slow down' } } });
    expect(of(t, 'error')[0].error).toMatchObject({ code: 'rate_limited', detail: 'slow down' });
  });

  it('reads a log of the first Studio without breaking', () => {
    const t = replay(legacy as unknown as StudioItem[]);
    expect(of(t, 'result')).toHaveLength(1);
    expect(of(t, 'activity').length).toBeGreaterThan(0);
  });
});

describe('the acceptance decision (B3)', () => {
  const at = (n: number) => `2026-09-29T10:00:${String(n).padStart(2, '0')}Z`;
  const card = (id: string, variant: 'unverified' | 'rejected') => ({
    id, workId: 'W-a', createdAt: at(1), status: 'open', kind: 'acceptance', variant, summary: 'Fixed the rounding',
    items: [{ reason: 'no tests in this project', status: variant === 'rejected' ? 'Failed' : 'Unverified',
      findings: variant === 'rejected' ? [{ severity: 'blocker', location: 'src/a.py:3', issue: 'rounds down' }] : [] }],
  });
  const studio = (seq: number, kind: string, data: Record<string, unknown>): StudioItem => ({ at: at(seq), source: 'studio', ids: { work: 'W-a' }, seq, kind, data });
  const requested = (seq: number, c: ReturnType<typeof card>) => studio(seq, 'studio.decision_requested', { id: c.id, kind: 'acceptance', status: 'open', card: c });
  const ended = (seq: number) => studio(seq, 'studio.run_ended', { outcome: 'waiting_for_input', stopCode: 'acceptance_decision' });
  const waiting = (seq: number) => studio(seq, 'studio.task_state', { state: 'needs_you', reason: { code: 'acceptance_decision', detail: 'no tests' } });

  it('keeps the card open while the run waits for the user, then records "done"', () => {
    const t = replay([requested(1, card('a-1', 'unverified')), ended(2), waiting(3)]);
    expect(t.state).toBe('needs_you');
    expect(t.pending().map(c => c.card.kind)).toEqual(['acceptance']);
    expect(of(t, 'error')).toEqual([]);
    t.apply(studio(4, 'studio.decision_resolved', { id: 'a-1', kind: 'acceptance', status: 'answered', reply: { kind: 'accept', text: 'the user confirmed the task is done' }, card: card('a-1', 'unverified') }));
    const c = of(t, 'card')[0];
    expect(c).toMatchObject({ status: 'answered', decision: 'done' });
    expect(c.answer).toBeUndefined();
    expect(t.pending()).toEqual([]);
  });

  it('records a rework with the words the user typed', () => {
    const t = replay([
      requested(1, card('a-2', 'rejected')), ended(2), waiting(3),
      studio(4, 'studio.user_message', { text: 'handle negative prices', role: 'answer', cardId: 'a-2' }),
      studio(5, 'studio.decision_resolved', { id: 'a-2', kind: 'acceptance', status: 'answered', reply: { kind: 'rework', text: 'handle negative prices' } }),
    ]);
    expect(of(t, 'card')[0]).toMatchObject({ status: 'answered', decision: 'rework', answer: 'handle negative prices' });
    expect(of(t, 'user')).toEqual([]);
    expect(translate('en', 'card.acceptance_rework_text', { text: 'x' })).toBe('You asked for rework: x');
  });

  it('shows an acceptance by the auto mode as a notice and keeps a replayed decision of the user out of the conversation', () => {
    const t = replay([
      studio(1, 'studio.policy_decision', { kind: 'acceptance', status: 'policy', reason: 'accepted', reply: { kind: 'Accept', reason: 'not verified: no tests' }, card: card('p-1', 'unverified') }),
      studio(2, 'studio.policy_decision', { kind: 'acceptance', status: 'policy', reason: 'accept', reply: { kind: 'Accept' }, card: card('p-2', 'unverified') }),
    ]);
    expect(of(t, 'notice').map(n => translate('en', n.text.key, n.text.params))).toEqual(['Accepted automatically: not verified']);
    expect(t.technical).toHaveLength(1);
  });

  it('replaces an open card by a newer one and closes it when the task stops', () => {
    const t = replay([requested(1, card('a-3', 'unverified')), requested(2, card('a-4', 'rejected'))]);
    expect(t.pending().map(c => c.id)).toEqual(['a-4']);
    t.apply(studio(3, 'studio.task_state', { state: 'stopped' }));
    expect(t.pending()).toEqual([]);
  });

  it('is replayed by the Flow without breaking', () => {
    const m = new FlowModel();
    const items = [requested(1, card('a-5', 'rejected')), ended(2), waiting(3), studio(4, 'studio.decision_resolved', { id: 'a-5', status: 'answered', reply: { kind: 'rework' } }),
      studio(5, 'studio.policy_decision', { kind: 'acceptance', reason: 'accepted', card: card('p-3', 'unverified') })];
    expect(() => { for (const i of items) m.apply(i, false); }).not.toThrow();
  });
});

describe('texts of the timeline', () => {
  it('have a sentence in the catalog and none of the forbidden words', () => {
    for (const r of [asked, auto, followUp, live, paused]) {
      for (const text of texts(replay(rec(r).items))) {
        expect(text).not.toMatch(/^(notice|step)\./);
        // File names and commands of the project are the user's own words; the sentence around them is ours.
        expect(offences(text.replace(/[`"][^`"]*[`"]/g, '').replace(/\S*[\/.]\S*/g, ''), FORBIDDEN)).toEqual([]);
      }
    }
  });

  it('summarises a group of steps by kind', () => {
    const t = replay(rec(asked).items);
    const first = of(t, 'activity')[0];
    expect(summarize(first.steps)).toEqual([{ key: 'group.read', n: 2, failed: false }]);
  });
});

describe('a test change only the user approves (C11)', () => {
  const at = (n: number) => `2026-10-03T10:00:${String(n).padStart(2, '0')}Z`;
  const studio = (seq: number, kind: string, data: Record<string, unknown>): StudioItem => ({ at: at(seq), source: 'studio', ids: { work: 'W-a' }, seq, kind, data });
  const card = { id: 'd-1', workId: 'W-a', createdAt: at(1), status: 'pending', kind: 'review', variant: 'integrity',
    items: [{ path: 'src/test/price.spec.ts', checks: ['CHK-test'] }], model: { outcome: 'approve', findings: [] } };

  it('waits for the user on the review card and records the approval', () => {
    const t = replay([studio(1, 'studio.decision_requested', { id: 'd-1', kind: 'review', status: 'pending', card })]);
    expect(t.state).toBe('needs_you');
    expect(t.pending().map(c => c.card.kind)).toEqual(['review']);
    t.apply(studio(2, 'studio.decision_resolved', { id: 'd-1', kind: 'review', status: 'answered', reply: { outcome: 'Approve', reviewer: 'human' } }));
    expect(of(t, 'card')[0]).toMatchObject({ status: 'answered', decision: 'approved' });
    expect(t.pending()).toEqual([]);
  });

  it('records a rejection', () => {
    const t = replay([studio(1, 'studio.decision_requested', { id: 'd-1', kind: 'review', status: 'pending', card }),
      studio(2, 'studio.decision_resolved', { id: 'd-1', kind: 'review', status: 'answered', reply: { outcome: 'Reject', reviewer: 'human' } })]);
    expect(of(t, 'card')[0]).toMatchObject({ decision: 'rejected' });
  });

  it('keeps the model\'s look at the change out of the conversation: it is on the card', () => {
    const t = replay([studio(1, 'studio.policy_decision', { kind: 'review', status: 'policy', reason: 'approve', request: { humanOnly: true }, reply: { outcome: 'Approve' } })]);
    expect(of(t, 'notice')).toEqual([]);
    expect(t.technical).toHaveLength(1);
  });

  it('is a waiting task, not an error, when the run stops for the user', () => {
    const t = replay([
      studio(1, 'studio.run_ended', { outcome: 'waiting_for_input', stopCode: 'integrity_review' }),
      studio(2, 'studio.task_state', { state: 'needs_you', reason: { code: 'integrity_review' } }),
    ]);
    expect(t.state).toBe('needs_you');
    expect(of(t, 'error')).toEqual([]);
  });
});
