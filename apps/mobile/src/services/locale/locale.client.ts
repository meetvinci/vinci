import { isLocale, matchLocale, setLocale } from '@repo/i18n/client';
import * as SecureStore from 'expo-secure-store';
import { LOCALE_STORAGE_KEY } from './locale.constants';
import type { LocaleChoice } from '@/types/locale.types';
import type { Locale } from '@repo/i18n/client';

export function localeRead(): LocaleChoice {
  const saved = SecureStore.getItem(LOCALE_STORAGE_KEY);

  return isLocale(saved) ? saved : 'system';
}

export function localeSystem(): Locale {
  return matchLocale([new Intl.DateTimeFormat().resolvedOptions().locale]);
}

export function localeApply(choice: LocaleChoice): Locale {
  const locale = choice === 'system' ? localeSystem() : choice;
  void setLocale(locale, { reload: false });

  return locale;
}

export function localeSave(choice: LocaleChoice) {
  SecureStore.setItem(LOCALE_STORAGE_KEY, choice);
}
