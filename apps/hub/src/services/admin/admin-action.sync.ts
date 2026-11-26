import { log } from '@repo/logger/server';
import { setTimeout as sleep } from 'node:timers/promises';
import { match } from 'ts-pattern';
import { ADMIN } from './admin.constants';
import type * as AdminTypes from '../../types/admin.types';

export async function adminActionSync(deps: AdminTypes.AdminServiceDeps, { by, attempts }: AdminTypes.AdminSyncParams): Promise<void> {
  if (!deps.provisioner.queries.isConfigured() || deps.state.isBroken || deps.state.admins.length === 0) {
    return;
  }

  const isSynced = await deps.provisioner.actions.admins({ emails: deps.state.admins }).then(() => true).catch((error: unknown) => {
    match(attempts > 1)
      .with(true, () => log.warn({
        tag: 'hub',
        message: 'The provisioner did not take the admin list yet; trying again',
        by,
        error,
      }))
      .otherwise(() => log.error({
        tag: 'hub',
        message: 'The provisioner could not write the admin list to users.yaml; the next admin change tries again',
        by,
        error,
      }));

    return false;
  });

  if (isSynced || attempts <= 1) {
    return;
  }

  await sleep(ADMIN.startSyncRetryMs, null, { ref: false });
  await adminActionSync(deps, { by, attempts: attempts - 1 });
}
