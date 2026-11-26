import { log } from '@repo/logger/server';
import type { AccountsPut } from '../../types/accounts.types';
import type * as AdminTypes from '../../types/admin.types';

export function adminAccountPut(deps: AdminTypes.AdminServiceDeps, { email, by }: AdminTypes.AdminChangeParams): Promise<AccountsPut> {
  return deps.accounts.actions.put({
    email,
    name: null,
    by,
  });
}

export async function adminAccountUndo(deps: AdminTypes.AdminServiceDeps, { account, ...target }: AdminTypes.AdminAccountUndoParams): Promise<void> {
  if (!account?.created) {
    return;
  }

  await deps.accounts.actions.remove(target).catch((error: unknown) => log.error({
    tag: 'hub',
    message: 'The admin list could not be saved, and the login account made for the new admin could not be removed; remove it with the accounts service',
    admin: target.email,
    error,
  }));
}

export async function adminAccountRemove(deps: AdminTypes.AdminServiceDeps, { email, by }: AdminTypes.AdminChangeParams): Promise<void> {
  if (!(await deps.provisioner.queries.list()).some((user) => user.email === email)) {
    await deps.accounts.actions.remove({ email, by });
  }
}
