import { describe, expect, it } from 'vitest';
import { fill, translate, translatePlural } from '../../i18n/translate';
import { describe as steps, hidden, nodeOf, opOf, statusOf } from '../../timeline/steps';
import { folderOf, grouped } from '../panel/change-groups';
import { SECTIONS, SETTINGS } from '../settings/setting-list';
import { fitEffort } from './effort';
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
