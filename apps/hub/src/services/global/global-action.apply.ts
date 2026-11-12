import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import { globalActionCopy } from './global-action.copy';
import { globalActionSave } from './global-action.save';
import { globalQueryPreview } from './global-query.preview';
import { GLOBAL } from './global.constants';
import { globalQueue, globalSectionState, globalSerial, globalWithSection } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';

export async function globalActionApply(deps: GlobalTypes.GlobalServiceDeps, { id, sections, by, marker }: GlobalTypes.GlobalApplyParams): Promise<void> {
  await globalQueue(deps, id, async () => {
    await deps.users.actions.reload();

    const user = await deps.users.queries.get({ id });

    await globalSerial(sections, async (section) => {
      if (marker !== undefined) {
        if ((await globalQueryPreview(deps, { id, section })).marker !== marker) {
          throw new Errors.CONFLICT({ internal: `The ${section} preview of ${id} is stale` });
        }

        await globalActionSave(deps, { change: (file) => globalWithSection(file, id, section, { mode: 'global', sync: 'pending' }) });
      }

      await globalActionSave(deps, { change: (file) => (globalSectionState(file, id, section).mode === 'global' ? globalWithSection(file, id, section, { mode: 'global', sync: 'pending' }) : file) });

      if (!user || globalSectionState(deps.state.file, id, section).mode !== 'global') {
        return;
      }

      const failure = await globalActionCopy(deps, { user, section }).then(() => null).catch((error: unknown) => {
        deps.daemons.actions.forget({ user });

        return match(error)
          .with(P.instanceOf(Error), ({ message }) => message)
          .otherwise(String)
          .slice(0, GLOBAL.errorMaxLength);
      });

      await globalActionSave(deps, {
        change: (file) => globalWithSection(file, id, section, match({ mode: globalSectionState(file, id, section).mode, failure })
          .with({ mode: 'overridden' }, () => ({ mode: 'overridden' as const, sync: 'in-sync' as const }))
          .with({ failure: P.string }, ({ failure: error }) => ({ mode: 'global' as const, sync: 'failed' as const, error }))
          .otherwise(() => ({ mode: 'global' as const, sync: 'in-sync' as const }))),
      });

      log.info({
        tag: 'hub',
        message: failure === null ? 'Global section copied to a user' : 'Global section copy failed',
        by,
        user: id,
        section,
        error: failure,
      });
    });
  });
}
