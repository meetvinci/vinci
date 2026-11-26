import { log } from '@repo/logger/server';
import { join } from 'node:path';
import { adminActionChange } from './admin-action.change';
import { adminActionReload } from './admin-action.reload';
import { adminActionSync } from './admin-action.sync';
import { adminQueryList } from './admin-query.list';
import { ADMIN } from './admin.constants';
import { adminDriverWrite } from './admin.driver';
import type * as AdminTypes from '../../types/admin.types';

export async function makeAdminService({ directory, seed, provisioner, accounts }: AdminTypes.AdminServiceParams): Promise<AdminTypes.AdminService> {
  const deps: AdminTypes.AdminServiceDeps = {
    path: join(directory, ADMIN.file),
    provisioner,
    accounts,
    state: { admins: [], isBroken: false, mtimeMs: undefined, checkedAt: 0, saving: Promise.resolve() },
  };

  await adminActionReload(deps);

  if (!deps.state.isBroken && deps.state.admins.length === 0 && seed.length > 0) {
    deps.state.mtimeMs = await adminDriverWrite(deps.path, [...new Set(seed)]);
    deps.state.admins = [...new Set(seed)];
    log.info({
      tag: 'hub',
      message: 'Admins seeded from HUB_ADMIN_EMAILS',
      admins: deps.state.admins.length,
    });
  }

  void adminActionSync(deps, { by: 'hub start', attempts: ADMIN.startSyncAttempts });

  return {
    queries: {
      list: () => adminQueryList(deps),
      has: async ({ email }) => (await adminQueryList(deps)).includes(email.toLowerCase()),
    },
    actions: {
      add: (input) => adminActionChange(deps, { ...input, isAdding: true }),
      remove: (input) => adminActionChange(deps, { ...input, isAdding: false }),
    },
  };
}
