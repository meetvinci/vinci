import { createContext } from 'react';
import type { LocaleContextValue } from '@/types/locale.types';

export const localeContext = createContext<LocaleContextValue | null>(null);
