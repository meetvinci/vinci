import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { globalActionApply } from './global-action.apply';
import { globalActionSave } from './global-action.save';
import { globalSectionState, globalWithSection } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';
import type { AdminSection } from '@repo/contracts/universal';

export async function globalActionMode(deps: GlobalTypes.GlobalServiceDeps, { id, section, mode, by }: GlobalTypes.GlobalModeParams): Promise<AdminSection> {
  if (!(await deps.users.queries.list()).some((user) => user.id === id)) {
    throw new Errors.NOT_FOUND({
      resource: 'user',
      resourceId: id,
      internal: `No user ${id}`,
    });
  }

  await globalActionSave(deps, { change: (file) => globalWithSection(file, id, section, { mode, sync: mode === 'global' ? 'pending' : 'in-sync' }) });
  log.info({
    tag: 'hub',
    message: 'Admin changed a section mode',
    by,
    user: id,
    section,
    mode,
  });

  if (mode === 'global') {
    await globalActionApply(deps, {
      id,
      sections: [section],
      by,
    });
  }

  return { id: section, ...globalSectionState(deps.state.file, id, section) };
}
