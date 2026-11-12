import { createContext } from 'react';
import { SECTION_SCOPE_APP } from '@/services/section/section.constants';
import type { SectionScope } from '@/types/section.types';

export const sectionScopeContext = createContext<SectionScope>(SECTION_SCOPE_APP);
