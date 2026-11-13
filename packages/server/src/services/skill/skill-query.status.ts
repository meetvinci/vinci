import { skillQuerySettings } from './skill-query.settings';
import type { SkillServiceDeps } from '../../types/skill.types';

export async function skillQueryStatus(deps: SkillServiceDeps) {
  const { directories } = await skillQuerySettings(deps);

  return deps.loader.queries.status({ directories });
}
