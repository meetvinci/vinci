import { log } from '@repo/logger/server';
import { setTimeout as sleep } from 'node:timers/promises';
import { match, P } from 'ts-pattern';
import { ADMIN } from './admin.constants';
import type * as AdminTypes from '../../types/admin.types';
import type { ProvisionerAccess } from '../../types/provisioner.types';

export async function adminActionSync(deps: AdminTypes.AdminServiceDeps, { by, attempts }: AdminTypes.AdminSyncParams): Promise<ProvisionerAccess> {
  if (!deps.provisioner.queries.isConfigured() || deps.state.isBroken || deps.state.admins.length === 0) {
    return 'manual';
  }

  const access = await deps.provisioner.actions.admins({ emails: deps.state.admins }).catch((error: unknown) => {
    match(attempts > 1)
      .with(true, () => log.warn({
        tag: 'hub',
        message: 'The provisioner did not take the admin list yet; trying again',
        by,
        error,
      }))
      .otherwise(() => log.error({
        tag: 'hub',
        message: 'The provisioner could not sync the admin emails to Access; the admin must add them by hand',
        by,
        error,
      }));

    return null;
  });

  return match({ access, isLast: attempts <= 1 })
    .with({ access: P.nonNullable }, ({ access: synced }) => synced)
    .with({ isLast: true }, () => 'manual' as const)
    .otherwise(async () => {
      await sleep(ADMIN.startSyncRetryMs);

      return adminActionSync(deps, { by, attempts: attempts - 1 });
    });
}
