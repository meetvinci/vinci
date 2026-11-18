import type { Locale } from '@repo/i18n/client';

export type LocaleChoice = Locale | 'system';

export interface LocaleChooseParams {
  choice: LocaleChoice;
}
