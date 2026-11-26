import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import type * as UserTypes from '../../types/user.types';

export async function userActionPassword(deps: UserTypes.UserServiceDeps, { id, by }: UserTypes.UserPasswordParams): Promise<UserTypes.UserPassword> {
  const current = (await deps.provisioner.queries.list()).find((user) => user.id === id);

  if (!current) {
    throw new Errors.NOT_FOUND({
      resource: 'user',
      resourceId: id,
      internal: `No user ${id}`,
    });
  }

  const { password } = await deps.accounts.actions.password({
    email: current.email,
    userId: id,
    by,
  });

  log.info({
    tag: 'hub',
    message: 'Admin reset the login password of a user',
    by,
    user: id,
  });

  return { password };
}
