import { globalActionApply } from './global-action.apply';
import { globalActionReload } from './global-action.reload';
import { globalQueryStatus } from './global-query.status';
import { GLOBAL } from './global.constants';
import type * as GlobalTypes from '../../types/global.types';

export async function globalActionSync(
  deps: GlobalTypes.GlobalServiceDeps,
  { section, by }: GlobalTypes.GlobalSyncParams,
): Promise<GlobalTypes.GlobalStatusUser[]> {
  await globalActionReload(deps);

  const sections = section ? [section] : GLOBAL.sections.map(({ id }) => id);
  const users = await deps.users.queries.list();

  await Promise.allSettled(users.map(({ id }) => globalActionApply(deps, {
    id,
    sections,
    by,
  })));

  return globalQueryStatus(deps);
}
