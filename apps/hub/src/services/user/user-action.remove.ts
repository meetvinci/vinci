import { log } from '@repo/logger/server';
import type * as UserTypes from '../../types/user.types';

export async function userActionRemove(deps: UserTypes.UserServiceDeps, { id, by }: UserTypes.UserRemoveParams): Promise<UserTypes.UserRemoved> {
  const access = await deps.provisioner.actions.remove({ id });

  log.info({
    tag: 'hub',
    message: 'Admin removed a user; the data volume is kept',
    by,
    user: id,
    access,
  });

  return { access };
}
