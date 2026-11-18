import { match, P } from 'ts-pattern';
import { baseLocale, isLocale, locales } from './paraglide/runtime.js';
import type { Locale } from './paraglide/runtime.js';

export { baseLocale as BASE_LOCALE, isLocale, locales as LOCALES } from './paraglide/runtime.js';
export type { Locale } from './paraglide/runtime.js';

export function resolveLocale(source: string | null | undefined | object): Locale {
  const locale = match(source)
    .with(P.string, (value) => value)
    .with({ locale: P.string }, (value) => value.locale)
    .otherwise(() => baseLocale);

  return isLocale(locale) ? locale : baseLocale;
}

export function matchLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const lower = tag.trim().toLowerCase();
    const language = lower.split('-')[0];

    const locale = locales.find((item) => item.toLowerCase() === lower)
      ?? locales.find((item) => item.toLowerCase().split('-')[0] === language);

    if (locale) {
      return locale;
    }
  }

  return baseLocale;
}

export function parseAcceptLanguage(header: string | null): string[] {
  return (header ?? '').split(',').map((part) => part.split(';')[0]);
}
