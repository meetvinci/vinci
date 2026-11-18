import { matchLocale, resolveLocale, setLocale } from '@repo/i18n/client';
import { createIsomorphicFn } from '@tanstack/react-start';
import { serialize } from 'cookie-es';
import { LOCALE } from './locale.constants';
import { localeSaved } from './locale.utils';
import type { LocaleChoice, LocaleChooseParams } from '@/types/locale.types';
import type { Locale } from '@repo/i18n/client';

export const localeBoot = createIsomorphicFn().client(() => {
  void setLocale(resolveLocale(document.documentElement.lang), { reload: false });
});

export function localeSystem(): Locale {
  return matchLocale(navigator.languages);
}

export function localeChoice(): LocaleChoice {
  return localeSaved(document.cookie) ?? 'system';
}

export function localeChoose({ choice }: LocaleChooseParams) {
  document.cookie = serialize(LOCALE.storageKey, choice === 'system' ? '' : choice, {
    path: '/',
    sameSite: 'lax',
    secure: location.protocol === 'https:',
    maxAge: choice === 'system' ? 0 : LOCALE.cookieMaxAgeSeconds,
  });

  location.reload();
}
