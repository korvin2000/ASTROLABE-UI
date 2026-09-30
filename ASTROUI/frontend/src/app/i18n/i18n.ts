import { Injectable, Pipe, PipeTransform, inject, signal } from '@angular/core';
import { Lang, Params, Text, known, translate, translatePlural } from './translate';

export type { Catalog, Lang, Params, Text } from './translate';
export { fill, translate, translatePlural } from './translate';


/**
 * The message catalog (Studio 2 FE-11): every text the user sees comes from here, one file per language.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>('en');

  use(lang: Lang | null | undefined): void {
    const next: Lang = lang === 'ru' ? 'ru' : 'en';
    this.lang.set(next);
    document.documentElement.lang = next;
  }

  t(key: string, params?: Params): string { return translate(this.lang(), key, params); }

  n(key: string, n: number, params?: Params): string { return translatePlural(this.lang(), key, n, params); }

  text(text: Text | null | undefined): string {
    if (!text) return '';
    return text.n === undefined ? this.t(text.key, text.params) : this.n(text.key, text.n, text.params);
  }

  has(key: string): boolean { return known(key); }
}

/** `{{ 'key' | t }}` and `{{ 'key' | t: { name: value } }}`. Impure, so a language change repaints. */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18n);

  transform(key: string | Text | null | undefined, params?: Params): string {
    if (!key) return '';
    return typeof key === 'string' ? this.i18n.t(key, params) : this.i18n.text(key);
  }
}
