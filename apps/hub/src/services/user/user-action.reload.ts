import { log } from '@repo/logger/server';
import { userDriverModified, userDriverRead } from './user.driver';
import type * as UserTypes from '../../types/user.types';

export async function userActionReload(deps: UserTypes.UserServiceDeps): Promise<void> {
  const { state } = deps;
  const mtimeMs = await userDriverModified(deps.path);

  state.checkedAt = Date.now();

  if (mtimeMs === state.mtimeMs) {
    return;
  }

  state.mtimeMs = mtimeMs;

  try {
    state.users = await userDriverRead(deps.path);
    log.info({
      tag: 'hub',
      message: 'Users loaded',
      users: state.users.size,
    });
  } catch (error) {
    state.users = new Map();
    log.error({
      tag: 'hub',
      message: `Users file ${deps.path} is missing, unreadable or invalid: every request is refused until it is fixed`,
      error,
    });
  }
}
