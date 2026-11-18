import FlagDe from '~icons/circle-flags/de';
import FlagEs from '~icons/circle-flags/es';
import FlagFr from '~icons/circle-flags/fr';
import FlagGb from '~icons/circle-flags/gb';
import FlagPt from '~icons/circle-flags/pt';
import type { Locale } from '@repo/i18n/client';

export const LOCALE = {
  storageKey: 'bots.locale',
  cookieMaxAgeSeconds: 365 * 24 * 60 * 60,
};

export const LOCALE_FLAGS = {
  'en': FlagGb,
  'pt-PT': FlagPt,
  'de': FlagDe,
  'es': FlagEs,
  'fr': FlagFr,
} satisfies Record<Locale, typeof FlagGb>;
