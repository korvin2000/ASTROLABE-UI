import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from './features/task/error-actions';
import { SETTINGS } from './features/settings/setting-list';
import { EN } from './i18n/catalog.en';
import { RU } from './i18n/catalog.ru';
import { offences, offencesRu } from './vocabulary';

// The vocabulary test (Studio 2 FE-12, A-10) and the checks of the message catalog (FE-11): no internal term in the
// default interface, no text outside the catalog, every key the code uses has a sentence.

const ROOT = join(__dirname);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts')) out.push(path);
  }
  return out;
}

const SOURCES = files(ROOT).filter(f => !/[\\/]i18n[\\/]catalog\./.test(f));

/** The templates of the app: `.html` files and the inline `template:` of components. */
function templates(): { file: string; html: string }[] {
  const out: { file: string; html: string }[] = [];
  for (const file of SOURCES) {
    const source = readFileSync(file, 'utf-8');
    if (file.endsWith('.html')) out.push({ file, html: source });
    else for (const m of source.matchAll(/template:\s*`([\s\S]*?)`,\s*\n\s*(?:styles|styleUrl|imports|changeDetection|\}\))/g)) out.push({ file, html: m[1] });
  }
  return out;
}

/** What a template shows by itself: its text between tags, without bindings, control flow and comments. */
function visible(html: string): string[] {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/@(?:if|else if|for|switch|case|default|else|empty|let)\b[^{]*\{/g, ' ')
    .replace(/<[^>]*>/g, '\n')
    .replace(/[{}]/g, ' ');
  return stripped.split('\n').map(s => s.trim()).filter(Boolean);
}

/** Attributes whose value the user reads or hears. */
function attributes(html: string): string[] {
  return [...html.matchAll(/\s(?:placeholder|title|aria-label|alt)="([^"]*)"/g)].map(m => m[1]);
}

const KEY = /^[a-z_]+(\.[a-z0-9_-]+)+$/;
const FAMILIES = ['action', 'gate', 'banner', 'error', 'sidebar', 'demo', 'dialog', 'folder', 'connect', 'signin', 'welcome', 'picker', 'price', 'effort', 'mode', 'composer',
  'new', 'example', 'card', 'effect', 'checks', 'verified', 'result', 'state', 'step', 'now', 'notice', 'group', 'flow', 'rail', 'progress', 'plan', 'output', 'changes', 'commit',
  'undo', 'panel', 'watchdog', 'settings', 'theme', 'account', 'confirm', 'empty', 'time', 'usage', 'count', 'notify', 'task',
  'preset', 'limit', 'meter', 'provenance'];
/** Names of events, topics and commands that look like keys. */
const NOT_KEYS = new Set(['task.updated', 'task.deleted', 'task.done', 'task.failed', 'task.paused', 'notice.', 'accounts.changed', 'settings.save']);

function usedKeys(): Map<string, string> {
  const used = new Map<string, string>();
  for (const file of SOURCES) {
    const source = readFileSync(file, 'utf-8');
    for (const m of source.matchAll(/'([a-z_]+(?:\.[a-z0-9_-]+)+)'/g)) {
      const key = m[1];
      if (KEY.test(key) && FAMILIES.includes(key.split('.')[0]) && !NOT_KEYS.has(key)) used.set(key, relative(ROOT, file));
    }
  }
  return used;
}

const has = (key: string) => EN[key] !== undefined || EN[key + '.other'] !== undefined;

describe('vocabulary (section 3)', () => {
  it('finds a forbidden word as a whole word, with its plural', () => {
    expect(offences('Return to the task')).toEqual([]);
    expect(offences('Your turn')).toEqual(['turn']);
    expect(offences('The profiles of the model')).toEqual(['profile']);
    expect(offences('Investigate the problem')).toEqual([]);
    expect(offences('Shape S0 of cell-ab12cd')).toEqual(expect.arrayContaining(['shape', '\\bS[0-3]\\b']));
    expect(offences('see §7.3')).toHaveLength(1);
  });

  it('keeps the English catalog free of internal terms', () => {
    const bad = Object.entries(EN).map(([key, text]) => ({ key, words: offences(text) })).filter(x => x.words.length);
    expect(bad).toEqual([]);
  });

  it('keeps the Russian catalog free of internal terms', () => {
    const bad = Object.entries(RU).map(([key, text]) => ({ key, words: [...offences(text), ...offencesRu(text)] })).filter(x => x.words.length);
    expect(bad).toEqual([]);
  });

  it('has the four plural forms of Russian for every plural key', () => {
    const plural = Object.keys(EN).filter(k => k.endsWith('.other')).map(k => k.slice(0, -'.other'.length)).filter(k => EN[k + '.one'] !== undefined);
    expect(plural.length).toBeGreaterThan(5);
    for (const key of plural) for (const f of ['one', 'few', 'many', 'other']) expect(RU[`${key}.${f}`], `${key}.${f}`).toBeTruthy();
  });

  it('keeps the templates free of internal terms', () => {
    const bad: { file: string; text: string; words: string[] }[] = [];
    for (const t of templates()) {
      for (const text of [...visible(t.html), ...attributes(t.html)]) {
        const words = offences(text);
        if (words.length) bad.push({ file: relative(ROOT, t.file), text, words });
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('message catalog (FE-11)', () => {
  it('has templates to check', () => {
    expect(templates().length).toBeGreaterThan(15);
  });

  it('holds every text: templates contain no sentence of their own', () => {
    // Names of products and keys, marks and numbers are not sentences.
    const allowed = /^(ASTROLABE|OpenRouter|Enter|Ctrl\+Enter|Ctrl N|git|[\p{P}\p{S}\d\s+−]+)$/u;
    const bad: { file: string; text: string }[] = [];
    for (const t of templates()) {
      for (const text of visible(t.html)) {
        if (!allowed.test(text) && /\p{L}{2,}/u.test(text)) bad.push({ file: relative(ROOT, t.file), text });
      }
      for (const text of attributes(t.html)) {
        if (/\p{L}{2,}/u.test(text) && !/^[a-z0-9:/. -]+$/i.test(text)) bad.push({ file: relative(ROOT, t.file), text });
      }
    }
    expect(bad).toEqual([]);
  });

  it('has a sentence for every key the code names', () => {
    const missing = [...usedKeys()].filter(([key]) => !has(key)).map(([key, file]) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });

  it('has a sentence and at most two actions for every error and pause reason (section 10)', () => {
    for (const code of ERROR_CODES) expect(EN['error.' + code], code).toBeTruthy();
  });

  it('has a name and one line of help for every setting (section 9)', () => {
    for (const s of SETTINGS) {
      expect(EN['settings.' + s.id], s.id).toBeTruthy();
      expect(EN['settings.' + s.id + '.help'], s.id).toBeTruthy();
    }
  });

  it('names the same parameters in Russian as in English', () => {
    const params = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
    const form = /\.(one|few|many|other)$/;
    const bad = Object.entries(RU).filter(([key, text]) => {
      // A plural form may leave the number out ("once"); it never names a parameter the English sentence lacks.
      if (form.test(key) && EN[key.replace(form, '.other')] !== undefined) {
        const en = params(EN[key.replace(form, '.other')]);
        return params(text).some(p => !en.includes(p));
      }
      return EN[key] === undefined || params(EN[key]).join() !== params(text).join();
    }).map(([key]) => key);
    expect(bad).toEqual([]);
  });

  it('has every English key in Russian', () => {
    const plural = /\.(one|other)$/;
    const missing = Object.keys(EN).filter(key => RU[key] === undefined && !(plural.test(key) && RU[key.replace(plural, '.many')] !== undefined));
    expect(missing).toEqual([]);
  });
});
