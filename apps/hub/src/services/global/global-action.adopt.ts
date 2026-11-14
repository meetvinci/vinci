import { log } from '@repo/logger/server';
import { globalActionApply } from './global-action.apply';
import { globalActionReload } from './global-action.reload';
import { globalActionRetry } from './global-action.retry';
import { globalActionSave } from './global-action.save';
import { GLOBAL } from './global.constants';
import { globalDriverModified, globalDriverNewRead, globalDriverNewRemove } from './global.driver';
import { globalFollowing, globalSectionState } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';

export async function globalActionAdopt(deps: GlobalTypes.GlobalServiceDeps, { by }: GlobalTypes.GlobalAdoptParams): Promise<void> {
  const { state } = deps;
  const mtimeMs = await globalDriverModified(deps.newPath);

  if (mtimeMs !== state.fresh.mtimeMs) {
    const ids = mtimeMs === null ? [] : await globalDriverNewRead(deps.newPath).catch((error: unknown) => {
      log.error({
        tag: 'hub',
        message: `${deps.newPath} is unreadable or invalid: people apply just created do not follow global settings until the next apply`,
        error,
      });

      return [];
    });

    state.fresh = { mtimeMs, ids };
  }

  const listed = state.fresh;

  if (listed.ids.length === 0 || listed.mtimeMs === null || listed.mtimeMs === undefined) {
    return;
  }

  await globalActionReload(deps);

  if (state.isBroken) {
    return;
  }

  const ids = listed.ids.filter((id) => !Object.hasOwn(state.file.users, id));

  if (ids.length > 0) {
    await globalActionSave(deps, {
      change: (file) => ({
        users: { ...file.users, ...Object.fromEntries(ids.filter((id) => !Object.hasOwn(file.users, id)).map((id) => [id, globalFollowing()])) },
      }),
    });
  }

  await globalDriverNewRemove(deps.newPath, listed.mtimeMs);
  state.fresh = { mtimeMs: null, ids: [] };

  if (ids.length === 0) {
    return;
  }

  log.info({
    tag: 'hub',
    message: 'People apply just created now follow every global section',
    by,
    users: ids,
  });

  const sections = GLOBAL.sections.map(({ id }) => id);

  void Promise.allSettled(ids.map(async (id) => {
    await globalActionApply(deps, {
      id,
      sections,
      by,
    });
    await globalActionRetry(deps, {
      id,
      sections: sections.filter((section) => globalSectionState(state.file, id, section).sync === 'failed'),
      by,
      attempts: GLOBAL.startAttempts,
    });
  }));
}
