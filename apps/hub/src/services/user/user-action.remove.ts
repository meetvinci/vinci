import { log } from '@repo/logger/server';
import type * as UserTypes from '../../types/user.types';

export async function userActionRemove(deps: UserTypes.UserServiceDeps, { id, by }: UserTypes.UserRemoveParams): Promise<UserTypes.UserRemoved> {
  const current = (await deps.provisioner.queries.list()).find((user) => user.id === id);
  const hasAccount = current !== undefined && !await deps.admins.queries.has({ email: current.email });

  if (hasAccount) {
    await deps.accounts.actions.remove({
      email: current.email,
      userId: id,
      by,
    });
  }

  await deps.provisioner.actions.remove({ id });

  log.info({
    tag: 'hub',
    message: 'Admin removed a user; the data volume is kept',
    by,
    user: id,
    account: hasAccount ? 'removed' : 'kept',
  });

  return { removed: true };
}
