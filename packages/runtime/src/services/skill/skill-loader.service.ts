import { skillQueryExpand } from './skill-query.expand';
import { skillQueryLoad } from './skill-query.load';
import { skillQueryStatus } from './skill-query.status';
import type * as SkillTypes from '../../types/skill.types';

export function makeSkillLoaderService({ root, isSandboxed }: Pick<SkillTypes.SkillLoaderServiceDeps, 'root' | 'isSandboxed'>) {
  const deps: SkillTypes.SkillLoaderServiceDeps = { root, isSandboxed, catalogs: new Map() };

  return {
    queries: {
      load: (params: SkillTypes.SkillLoadParams) => skillQueryLoad(deps, params),
      expand: (params: SkillTypes.SkillExpandParams) => skillQueryExpand(deps, params),
      status: (params: SkillTypes.SkillStatusParams) => skillQueryStatus(deps, params),
    },
  };
}

export type SkillLoaderService = ReturnType<typeof makeSkillLoaderService>;
