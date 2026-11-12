import { use } from 'react';
import { sectionScopeContext } from '@/context/section';

export function useSectionScope() {
  return use(sectionScopeContext);
}
