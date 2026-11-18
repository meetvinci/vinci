import { Fragment, useState } from 'react';
import { localeContext } from '@/context/locale';
import { localeApply, localeRead, localeSave, localeSystem } from '@/services/locale/locale.client';
import type { LocaleChoice } from '@/types/locale.types';
import type { ReactNode } from 'react';

interface ContextLocaleProps {
  children: ReactNode;
}

export function ContextLocale({ children }: ContextLocaleProps) {
  const [choice, setChoice] = useState(localeRead);
  const locale = localeApply(choice);

  const choose = (next: LocaleChoice) => {
    localeSave(next);
    setChoice(next);
  };

  return (
    <localeContext.Provider value={{ choice, system: localeSystem(), choose }}>
      <Fragment key={locale}>{children}</Fragment>
    </localeContext.Provider>
  );
}
