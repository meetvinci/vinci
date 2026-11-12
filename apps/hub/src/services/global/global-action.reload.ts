import { log } from '@repo/logger/server';
import { globalDriverModified, globalDriverRead } from './global.driver';
import type * as GlobalTypes from '../../types/global.types';

export async function globalActionReload(deps: GlobalTypes.GlobalServiceDeps): Promise<void> {
  const { state } = deps;
  const mtimeMs = await globalDriverModified(deps.path);

  if (state.pending > 0 || mtimeMs === state.mtimeMs) {
    return;
  }

  if (mtimeMs === null && state.mtimeMs !== null && state.mtimeMs !== undefined) {
    log.error({ tag: 'hub', message: `Global settings file ${deps.path} disappeared: every person now counts as overridden until an admin switches sections back to global` });
  }

  const reading = mtimeMs === null ? Promise.resolve({ users: {} }) : globalDriverRead(deps.path);

  const read = await reading.then((file) => ({ file, isBroken: false })).catch((error: unknown) => {
    log.error({
      tag: 'hub',
      message: `Global settings file ${deps.path} is unreadable or invalid: section writes and global changes are refused until it is fixed`,
      error,
    });

    return { file: { users: {} }, isBroken: true };
  });

  if (state.pending > 0) {
    return;
  }

  state.file = read.file;
  state.isBroken = read.isBroken;
  state.mtimeMs = mtimeMs;
}
