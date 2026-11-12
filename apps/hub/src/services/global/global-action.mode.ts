import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { globalActionApply } from './global-action.apply';
import { globalActionSave } from './global-action.save';
import { globalSectionState, globalWithSection } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';
import type { AdminSection } from '@repo/contracts/universal';

export async function globalActionMode(
  deps: GlobalTypes.GlobalServiceDeps,
  { id, section, mode, marker, by }: GlobalTypes.GlobalModeParams,
): Promise<AdminSection> {
  if (!(await deps.users.queries.list()).some((user) => user.id === id)) {
    throw new Errors.NOT_FOUND({
      resource: 'user',
      resourceId: id,
      internal: `No user ${id}`,
    });
  }

  if (mode === 'overridden') {
    await globalActionSave(deps, { change: (file) => globalWithSection(file, id, section, { mode, sync: 'in-sync' }) });
  } else if (marker === undefined && globalSectionState(deps.state.file, id, section).mode === 'overridden') {
    throw new Errors.VALIDATION_ERROR({ fields: { marker: { message: 'validation_invalid' } }, internal: `Switching ${section} of ${id} back to global needs the marker of its preview` });
  } else {
    await globalActionApply(deps, {
      id,
      sections: [section],
      by,
      marker,
    });
  }

  log.info({
    tag: 'hub',
    message: 'Admin changed a section mode',
    by,
    user: id,
    section,
    mode,
  });

  return { id: section, ...globalSectionState(deps.state.file, id, section) };
}
