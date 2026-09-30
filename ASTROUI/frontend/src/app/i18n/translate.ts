import { EN } from './catalog.en';
import { RU } from './catalog.ru';

export type Params = Record<string, unknown>;
export type Lang = 'en' | 'ru';
export type Catalog = Record<string, string>;

/** A text of the catalog by key: what a reducer or a model hands to a component instead of a finished sentence. */
export interface Text { key: string; params?: Params; /** Chooses the plural form of the key (`key.one`, `key.other`). */ n?: number; }

const CATALOGS: Record<Lang, Catalog> = { en: EN, ru: RU };

/** Fills `{name}` places of [template] from [params]; an absent parameter leaves an empty place, never the braces. */
export function fill(template: string, params?: Params): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params?.[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** The text of [key] in [lang], English when the language lacks it, the key itself when nobody has it. */
export function translate(lang: Lang, key: string, params?: Params): string {
  const template = CATALOGS[lang]?.[key] ?? EN[key];
  return template === undefined ? key : fill(template, params);
}

/** The plural form of [key] for [n]: `key.one`, `key.few`, `key.many` or `key.other`, by the rules of the language. */
export function translatePlural(lang: Lang, key: string, n: number, params?: Params): string {
  // A language that lacks the key is answered in English, with the plural rules of English.
  for (const l of lang === 'en' ? [lang] : [lang, 'en'] as Lang[]) {
    const catalog = CATALOGS[l];
    const template = catalog?.[`${key}.${new Intl.PluralRules(l).select(n)}`] ?? catalog?.[`${key}.other`];
    if (template !== undefined) return fill(template, { ...params, n });
  }
  return key;
}

/** True when the English catalog has [key]; English is the reference of every language. */
export function known(key: string): boolean { return EN[key] !== undefined; }
