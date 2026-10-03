import { describe, expect, it } from 'vitest';
import { fill, translate, translatePlural } from '../../i18n/translate';
import { describe as steps, hidden, nodeOf, opOf, statusOf } from '../../timeline/steps';
import { folderOf, grouped } from '../panel/change-groups';
import { SECTIONS, SETTINGS } from '../settings/setting-list';
import { fitEffort } from './effort';
import { acceptanceBody, acceptanceChoices, doneUnverified, modelVerdictKey, reviewBody, reviewChoices, reworkable, stateKey, testChanges, verifiedOf } from './acceptance';
import { DEFAULT_LIMITS, NO_LIMITS, limitKindOf, limitsText, meterText, parseLimit, raised, raises } from './limits';
import { ERROR_CODES, actionsOf } from './error-actions';
import { sends } from './keys';
import { kindOf } from './project-kind';

// The small rules of the task view: what sends a message, what an error offers, how steps are worded.

const key = (k: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; isComposing: boolean }> = {}) =>
  ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, ...mods });

describe('composer keys (7.1, setting 3)', () => {
  it('sends with Enter and adds a line with Shift+Enter', () => {
    expect(sends(key('Enter'), 'enter')).toBe(true);
    expect(sends(key('Enter', { shiftKey: true }), 'enter')).toBe(false);
    expect(sends(key('a'), 'enter')).toBe(false);
  });

  it('sends with Ctrl+Enter when the user chose that', () => {
    expect(sends(key('Enter'), 'ctrl-enter')).toBe(false);
    expect(sends(key('Enter', { ctrlKey: true }), 'ctrl-enter')).toBe(true);
    expect(sends(key('Enter', { metaKey: true }), 'ctrl-enter')).toBe(true);
    expect(sends(key('Enter', { ctrlKey: true, shiftKey: true }), 'ctrl-enter')).toBe(false);
  });

  it('never sends while an input method composes a character', () => {
    expect(sends(key('Enter', { isComposing: true }), 'enter')).toBe(false);
  });
});

describe('effort (section 6.4)', () => {
  it('keeps the level the model has', () => {
    expect(fitEffort(['low', 'medium', 'high'], 'medium')).toBe('medium');
    expect(fitEffort(['low', 'high'], 'high')).toBe('high');
  });

  it('takes the nearest lower level, else the nearest higher one', () => {
    expect(fitEffort(['low', 'high'], 'medium')).toBe('low');
    expect(fitEffort(['medium', 'high'], 'low')).toBe('medium');
    expect(fitEffort(['high'], 'low')).toBe('high');
    expect(fitEffort(['xhigh', 'low'], 'high')).toBe('low');
  });

  it('is nothing for a model without levels', () => {
    expect(fitEffort([], 'medium')).toBeNull();
    expect(fitEffort(['minimal'], 'medium')).toBeNull();
  });
});

describe('errors (section 10)', () => {
  it('offer at most two actions', () => {
    for (const code of ERROR_CODES) {
      const a = actionsOf(code);
      expect(a.length, code).toBeGreaterThan(0);
      expect(a.length, code).toBeLessThanOrEqual(2);
    }
  });

  it('cover every code of the specification', () => {
    const spec = ['account_missing', 'auth_expired', 'auth_rejected', 'rate_limited', 'quota_exhausted', 'provider_unreachable', 'model_unavailable', 'project_not_found',
      'not_a_git_repo', 'project_busy', 'project_locked', 'no_verification', 'start_timeout', 'agent_error', 'limit_reached', 'command_timeout', 'context_too_large'];
    for (const code of spec) expect(ERROR_CODES, code).toContain(code);
  });

  it('treat a code nobody knows as an agent error', () => {
    expect(actionsOf('never_heard_of')).toEqual(actionsOf('agent_error'));
    expect(actionsOf('agent_error')).toEqual(['retry', 'copy_details']);
  });

  it('offer what the specification names', () => {
    expect(actionsOf('auth_rejected')).toEqual(['replace_key', 'retry']);
    expect(actionsOf('project_busy')).toEqual(['open_task', 'stop_other']);
    expect(actionsOf('limit_reached')).toEqual(['continue_more', 'stop']);
    expect(actionsOf('interrupted')).toEqual(['continue']);
  });
});

describe('acceptance (B3)', () => {
  it('asks "is it done?" when the result could not be checked', () => {
    const c = acceptanceChoices({ variant: 'unverified' });
    expect(c.map(x => [x.label, x.decision])).toEqual([['action.acceptance_done', 'done'], ['action.acceptance_rework', 'rework']]);
    expect(translate('en', c[0].label)).toBe("Yes, it's done");
    expect(translate('en', c[1].label)).toBe('No, rework it');
    expect(translate('en', 'card.acceptance_unverified', { reasons: 'no tests' })).toBe('The result could not be checked automatically: no tests. Is the task done?');
  });

  it('offers to continue fixing first when the review found problems', () => {
    const c = acceptanceChoices({ variant: 'rejected' });
    expect(c.map(x => [x.label, x.decision])).toEqual([['action.continue_fixing', 'rework'], ['action.accept_as_is', 'done']]);
    expect(c[0].primary).toBe(true);
    expect(translate('ru', c[0].label)).toBe('Продолжить исправление');
    expect(translate('ru', c[1].label)).toBe('Принять как есть');
  });

  it('posts the decision, with the words of the user only for a rework', () => {
    expect(acceptanceBody('done')).toEqual({ decision: 'done' });
    expect(acceptanceBody('done', 'ignored')).toEqual({ decision: 'done' });
    expect(acceptanceBody('rework')).toEqual({ decision: 'rework' });
    expect(acceptanceBody('rework', '  ')).toEqual({ decision: 'rework' });
    expect(acceptanceBody('rework', ' handle nulls ')).toEqual({ decision: 'rework', answer: 'handle nulls' });
  });

  it('never offers Continue while the result waits for the word of the user', () => {
    for (const code of ['acceptance_decision', 'review_rejected']) {
      expect(ERROR_CODES).toContain(code);
      expect(actionsOf(code)).not.toContain('continue');
      expect(actionsOf(code)).toEqual(['copy_details']);
    }
  });

  it('offers "Not done — rework it" only for a result nobody checked automatically', () => {
    expect(reworkable('unverified')).toBe(true);
    expect(reworkable('user')).toBe(true);
    for (const kind of ['tests', 'review', 'build', 'answer', 'none', undefined]) expect(reworkable(kind), String(kind)).toBe(false);
    expect(translate('en', 'action.not_done_rework')).toBe('Not done — rework it');
    expect(translate('ru', 'composer.rework')).toBe('Что нужно изменить?');
  });

  it('never calls a done task plainly "Done" when no check passed (F5)', () => {
    for (const kind of ['none', 'unverified', 'user', undefined]) expect(stateKey('done', kind), String(kind)).toBe('state.done_unverified');
    for (const kind of ['tests', 'review', 'build', 'answer']) expect(stateKey('done', kind), kind).toBe('state.done');
    expect(stateKey('working', 'none')).toBe('state.working');
    expect(translate('en', 'state.done_unverified')).toBe('Done · not verified');
    expect(translate('ru', 'state.done_unverified')).toBe('Готово · не проверено');
  });

  it('says how the result was verified', () => {
    expect(verifiedOf('tests')).toMatchObject({ ok: true, output: true });
    expect(verifiedOf('review')).toEqual({ key: 'verified.review', ok: true, output: false });
    expect(verifiedOf('build')).toEqual({ key: 'verified.build', ok: true, output: true });
    expect(verifiedOf('user')).toEqual({ key: 'verified.user', ok: false, output: false });
    expect(verifiedOf('unverified')).toEqual({ key: 'verified.unverified', ok: false, output: false });
    expect(verifiedOf('answer')).toEqual({ key: 'verified.answer', ok: false, output: false });
    expect(verifiedOf('none').key).toBe('verified.none');
    expect(verifiedOf('something_new').key).toBe('verified.none');
    expect(translate('en', 'verified.user')).toBe('Accepted by you — not checked automatically');
    expect(translate('ru', 'verified.unverified')).toBe('Не проверено: принято автоматически');
    expect(translate('ru', 'verified.answer')).toBe('Изменений нет — агент ответил');
  });
});

describe('steps (Appendix A)', () => {
  const call = (name: string, args: Record<string, unknown>) => ({ name, args });

  it('words every tool call', () => {
    expect(steps(call('look', { what: 'read', target: 'src/a.py:10-20' }))[0]).toMatchObject({ text: { key: 'step.read', params: { path: 'src/a.py' } }, path: 'src/a.py' });
    expect(steps(call('look', { what: 'find', target: 'apply_discount' }))[0].text).toEqual({ key: 'step.search', params: { text: 'apply_discount' } });
    expect(steps(call('look', { what: 'tree' }))[0].text.key).toBe('step.explore');
    expect(steps(call('look', { what: 'refs', target: 'Foo' }))[0].text.key).toBe('step.lookup');
    expect(steps(call('kb', { op: 'search' }))[0].text.key).toBe('step.recall');
    expect(steps(call('run', { argv: ['npm', 'run', 'my test'] }))[0]).toMatchObject({ text: { key: 'step.run' }, command: 'npm run "my test"' });
    expect(steps(call('run', { op: 'cancel', handle: 'h1' }))[0].text.key).toBe('step.stop_command');
    expect(steps(call('verify', { what: 'acceptance' }))[0]).toMatchObject({ text: { key: 'step.checks' }, check: true });
    expect(steps(call('verify', { what: 'review' }))[0].text.key).toBe('step.review');
  });

  it('makes one step per file of an edit', () => {
    const s = steps(call('edit', { ops: [{ create: 'a.txt', content: 'x' }, { path: 'b.py', expect: 'h', hunks: [{ anchor: 'a', new: 'b' }] }, { delete: 'c.txt', expect: 'h' }, { rename: 'd.txt', to: 'e.txt', expect: 'h' }] }));
    expect(s.map(x => x.text.key)).toEqual(['step.create', 'step.edit', 'step.delete', 'step.rename']);
    expect(s.map(x => x.path)).toEqual(['a.txt', 'b.py', 'c.txt', 'e.txt']);
  });

  it('hides the bookkeeping of the agent and what becomes a card', () => {
    expect(hidden(call('state', { op: 'patch' }))).toBe(true);
    expect(hidden(call('task', { op: 'ask' }))).toBe(true);
    expect(hidden(call('task', { op: 'propose' }))).toBe(true);
    expect(hidden(call('kb', { op: 'propose' }))).toBe(true);
    expect(hidden(call('run', { op: 'poll' }))).toBe(true);
    expect(hidden(call('look', { what: 'read' }))).toBe(false);
  });

  it('knows the node of every tool', () => {
    expect(nodeOf('look', 'read')).toBe('explore');
    expect(nodeOf('look', 'recall')).toBe('memory');
    expect(nodeOf('kb', 'search')).toBe('memory');
    expect(nodeOf('edit', 'create')).toBe('edit');
    expect(nodeOf('run', 'run')).toBe('edit');
    expect(nodeOf('verify', 'tests')).toBe('checks');
    expect(nodeOf('state', 'patch')).toBeNull();
    expect(opOf(call('edit', { ops: [{ create: 'a', content: '' }] }))).toBe('create');
  });

  it('never calls an unclear result a success', () => {
    expect(statusOf('ok')).toBe('ok');
    expect(statusOf('passed')).toBe('ok');
    expect(statusOf('failed')).toBe('failed');
    expect(statusOf('refused')).toBe('failed');
    expect(statusOf('inconclusive')).toBe('unknown');
    expect(statusOf('unavailable')).toBe('unknown');
    expect(statusOf(undefined)).toBe('unknown');
  });
});

describe('texts', () => {
  it('fill their places and leave no braces', () => {
    expect(fill('Read {path}', { path: 'a.py' })).toBe('Read a.py');
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and ');
  });

  it('fall back to English, then to the key', () => {
    expect(translate('ru', 'no.such.key')).toBe('no.such.key');
    expect(translate('en', 'state.done')).toBe('Done');
  });

  it('choose the plural form of the language', () => {
    expect(translatePlural('en', 'count.files', 1)).toBe('1 file');
    expect(translatePlural('en', 'count.files', 4)).toBe('4 files');
    expect(translatePlural('ru', 'count.files', 1)).toBe('1 файл');
    expect(translatePlural('ru', 'count.files', 3)).toBe('3 файла');
    expect(translatePlural('ru', 'count.files', 5)).toBe('5 файлов');
  });
});

describe('changes (8.1)', () => {
  const file = (path: string) => ({ path, kind: 'M' });

  it('groups by folder only above twelve files', () => {
    const few = Array.from({ length: 12 }, (_, i) => file(`src/a${i}.ts`));
    expect(grouped(few)).toEqual([{ folder: '', files: few }]);
    const many = [...few, file('README.md'), file('docs/x.md')];
    expect(grouped(many).map(g => [g.folder, g.files.length])).toEqual([['src', 12], ['.', 1], ['docs', 1]]);
    expect(folderOf('a/b/c.ts')).toBe('a/b');
  });
});

describe('complexity budget (section 2)', () => {
  it('has twenty settings at most, in five sections', () => {
    expect(SECTIONS).toHaveLength(5);
    expect(SETTINGS.length).toBeLessThanOrEqual(20);
    expect(SETTINGS.map(s => s.n)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    for (const s of SETTINGS) expect(SECTIONS).toContain(s.section);
  });

  it('chooses examples by the kind of project', () => {
    expect(kindOf('pyproject.toml')).toBe('python');
    expect(kindOf('web/package.json')).toBe('web');
    expect(kindOf('build.gradle.kts')).toBe('jvm');
    expect(kindOf(undefined)).toBe('generic');
  });
});

describe('limits, approach and the outcome label (C4)', () => {
  const t = (k: string, p?: Record<string, unknown>) => k + (p ? JSON.stringify(p) : '');

  it('names the state by the core class and by a stop at the user limit', () => {
    expect(stateKey('done', 'tests', 'independent')).toBe('state.done');
    expect(stateKey('done', 'tests', 'agent_test')).toBe('state.done_agent_test');
    expect(stateKey('done', 'review', 'unverified')).toBe('state.done_unverified');
    expect(stateKey('paused', 'none', undefined, 'limit_money')).toBe('state.paused_limit');
    expect(stateKey('paused', 'none', undefined, 'limit_reached')).toBe('state.paused');
    // Without the class (older runs) the earlier rule holds.
    expect(stateKey('done', 'review')).toBe('state.done');
    expect(doneUnverified('done', 'review', 'agent_test')).toBe(true);
  });

  it('offers to raise a reached limit, and Continue for the built-in one', () => {
    expect(actionsOf('limit_money')).toEqual(['raise_limit', 'stop']);
    expect(actionsOf('limit_requests')).toEqual(['raise_limit', 'stop']);
    expect(actionsOf('limit_reached')).toEqual(['continue_more', 'stop']);
    expect(limitKindOf('limit_minutes')).toBe('minutes');
    expect(limitKindOf('limit_reached')).toBeNull();
  });

  it('doubles the reached limit, money to the cent, and keeps no limit as none', () => {
    const l = { moneyUsd: '7.25', minutes: 90, requests: null };
    expect(raised(l, 'money')).toEqual({ moneyUsd: '14.50', minutes: 90, requests: null });
    expect(raised(l, 'minutes').minutes).toBe(180);
    expect(raised(l, 'requests').requests).toBeNull();
    expect(raises(raised(l, 'money'), l, 'money')).toBe(true);
    expect(raises(l, l, 'money')).toBe(false);
    expect(raises({ ...l, moneyUsd: null }, l, 'money')).toBe(true);
  });

  it('reads a limit field: empty is no limit, anything else a positive number', () => {
    expect(parseLimit('money', '')).toBeNull();
    expect(parseLimit('money', '7,5')).toBe('7.50');
    expect(parseLimit('money', '0')).toBeUndefined();
    expect(parseLimit('minutes', '1.5')).toBeUndefined();
    expect(parseLimit('requests', '3000')).toBe(3000);
    expect(parseLimit('requests', '100001')).toBeUndefined();
  });

  it('writes the limits short, time in hours from two hours on', () => {
    expect(limitsText(t, DEFAULT_LIMITS)).toBe('$50 · limit.short_hours{"n":8} · limit.short_requests{"n":3000}');
    expect(limitsText(t, { moneyUsd: '7.50', minutes: 90, requests: null })).toBe('$7.50 · limit.short_minutes{"n":90}');
    expect(limitsText(t, NO_LIMITS)).toBe('limit.no_limits');
  });

  it('writes the meter against the limits, and only the spend without them', () => {
    const view = { money: { spent: '0.42', unknown: false, estimated: false, limit: '50.00' }, time: { ms: 760_000, limitMin: 480 },
      requests: { n: 37, limit: 3000 }, context: { used: 41_000, limit: 200_000 }, near: false };
    expect(meterText(t, view)).toBe('$0.42 / $50.00 · 12:40 / limit.short_hours{"n":8} · meter.requests{"n":37,"limit":3000} · meter.context{"used":"41K","limit":"200K"}');
    const free = { ...view, money: { spent: null, unknown: false, estimated: true, limit: null }, time: { ms: 5_000, limitMin: null }, requests: { n: 2, limit: null }, context: { used: 0, limit: null } };
    expect(meterText(t, free)).toBe('meter.money_unknown · 0:05 · meter.requests_free{"n":2}');
  });
});

describe('a test change only the user approves (C11)', () => {
  const integrity = {
    kind: 'acceptance' as const,
    items: [{ reason: 'integrity:src/test/price.spec.ts: acceptance surface … — needs a human review', path: 'src/test/price.spec.ts', checks: ['CHK-test'], humanOnly: true }],
  };

  it('offers "Approve the test change" first and "Reject" on the acceptance card', () => {
    const c = acceptanceChoices({ variant: 'integrity' });
    expect(c.map(x => [x.label, x.decision])).toEqual([['action.approve_test_change', 'done'], ['action.reject_test_change', 'rework']]);
    expect(c[0].primary).toBe(true);
    expect(translate('ru', c[0].label)).toBe('Одобрить изменение теста');
    expect(translate('ru', c[1].label)).toBe('Отклонить');
    expect(translate('en', c[0].label)).toBe('Approve the test change');
  });

  it('answers a review card with approve or reject, the words of the user only with a rejection', () => {
    expect(reviewChoices().map(x => [x.label, x.decision])).toEqual([['action.approve_test_change', 'approve'], ['action.reject_test_change', 'reject']]);
    expect(reviewBody('approve', 'ignored')).toEqual({ decision: 'approve' });
    expect(reviewBody('reject')).toEqual({ decision: 'reject' });
    expect(reviewBody('reject', ' keep the old bound ')).toEqual({ decision: 'reject', answer: 'keep the old bound' });
  });

  it('names the changed test and its checks; the agent\'s reason only on a review card', () => {
    expect(testChanges(integrity)).toEqual([{ path: 'src/test/price.spec.ts', checks: ['CHK-test'] }]);
    const review = { kind: 'review' as const, items: [{ path: 'src/test/price.spec.ts', checks: ['CHK-test', 'CHK-ci'], reason: 'the old bound was wrong' }] };
    expect(testChanges(review)).toEqual([{ path: 'src/test/price.spec.ts', checks: ['CHK-test', 'CHK-ci'], reason: 'the old bound was wrong' }]);
    expect(testChanges({ kind: 'acceptance', items: [{ reason: 'no tests' }] })).toEqual([]);
    expect(translate('ru', 'card.integrity_checks', { checks: 'CHK-test' })).toBe('Касается проверок: CHK-test');
    expect(translate('ru', 'card.integrity_reason', { reason: 'x' })).toBe('Причина: x');
  });

  it('shows the model\'s verdict as information beside the card', () => {
    expect(modelVerdictKey('approve')).toBe('card.model.approve');
    expect(modelVerdictKey('revise')).toBe('card.model.revise');
    expect(modelVerdictKey('reject')).toBe('card.model.revise');
    expect(modelVerdictKey('insufficientevidence')).toBe('card.model.unsure');
    expect(modelVerdictKey(undefined)).toBe('card.model.unsure');
    expect(translate('ru', 'card.model.approve')).toBe('Модель одобряет изменение.');
  });

  it('waits for the user, never offers Continue, and is not an error', () => {
    expect(ERROR_CODES).toContain('integrity_review');
    expect(actionsOf('integrity_review')).toEqual(['copy_details']);
    expect(stateKey('needs_you', 'none')).toBe('state.needs_you');
    expect(translate('ru', 'error.integrity_review')).toBe('Агент изменил тесты, по которым идут обязательные проверки. Ждём вашего одобрения.');
  });
});
