import type { Locale } from '@repo/i18n/client';

export type LocaleChoice = Locale | 'system';

export interface LocaleContextValue {
  choice: LocaleChoice;
  system: Locale;
  choose: (choice: LocaleChoice) => void;
}
