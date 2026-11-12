import { log } from '@repo/logger/server';
import { adminDriverModified, adminDriverRead } from './admin.driver';
import type * as AdminTypes from '../../types/admin.types';

export async function adminActionReload(deps: AdminTypes.AdminServiceDeps): Promise<void> {
  const { state } = deps;
  const mtimeMs = await adminDriverModified(deps.path);

  state.checkedAt = Date.now();

  if (mtimeMs === state.mtimeMs) {
    return;
  }

  state.mtimeMs = mtimeMs;

  try {
    state.admins = mtimeMs === null ? [] : await adminDriverRead(deps.path);
    state.isBroken = false;
    log.info({
      tag: 'hub',
      message: 'Admins loaded',
      admins: state.admins.length,
    });
  } catch (error) {
    state.admins = [];
    state.isBroken = true;
    log.error({
      tag: 'hub',
      message: `Admins file ${deps.path} is unreadable or invalid: nobody is an admin until it is fixed`,
      error,
    });
  }
}
