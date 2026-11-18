import { isLocale, matchLocale, parseAcceptLanguage } from '@repo/i18n/config';
import { parse } from 'cookie-es';
import { LOCALE } from './locale.constants';
import type { Locale } from '@repo/i18n/config';

export function localeSaved(cookies: string): Locale | undefined {
  const saved = parse(cookies)[LOCALE.storageKey];

  return isLocale(saved) ? saved : undefined;
}

export function localeForRequest(request: Request): Locale {
  return localeSaved(request.headers.get('cookie') ?? '')
    ?? matchLocale(parseAcceptLanguage(request.headers.get('accept-language')));
}
