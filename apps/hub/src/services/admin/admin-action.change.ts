import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { adminActionReload } from './admin-action.reload';
import { adminActionSync } from './admin-action.sync';
import { adminDriverWrite } from './admin.driver';
import type * as AdminTypes from '../../types/admin.types';
import type { ProvisionerAccess } from '../../types/provisioner.types';

export async function adminActionChange(
  deps: AdminTypes.AdminServiceDeps,
  { email, by, isAdding }: AdminTypes.AdminChangeKindParams,
): Promise<ProvisionerAccess> {
  const { state } = deps;

  const saved = state.saving.then(async () => {
    await adminActionReload(deps);

    if (state.isBroken) {
      throw new Errors.INTERNAL_ERROR({ internal: 'Admins file is invalid; refusing to overwrite it' });
    }

    const isListed = state.admins.includes(email);

    if (!isAdding && !isListed) {
      throw new Errors.NOT_FOUND({ resource: 'admin', internal: `No admin ${email}` });
    }

    if (!isAdding && state.admins.length === 1) {
      throw new Errors.CONFLICT({ internal: 'Refusing to remove the last admin' });
    }

    const admins = isAdding ? [...new Set([...state.admins, email])] : state.admins.filter((admin) => admin !== email);

    state.mtimeMs = await adminDriverWrite(deps.path, admins);
    state.admins = admins;
    log.info({
      tag: 'hub',
      message: isAdding ? 'Admin added an admin' : 'Admin removed an admin',
      by,
      admin: email,
    });

    return adminActionSync(deps, { by, attempts: 1 });
  });

  state.saving = saved.then(() => undefined, () => undefined);

  return saved;
}
