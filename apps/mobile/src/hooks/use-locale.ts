import { Errors } from '@repo/errors/universal';
import { use } from 'react';
import { match, P } from 'ts-pattern';
import { localeContext } from '@/context/locale';

export function useLocale() {
  return match(use(localeContext))
    .with(P.nonNullable, (locale) => locale)
    .otherwise(() => {
      throw new Errors.INTERNAL_ERROR({ internal: 'Locale provider is missing' });
    });
}
