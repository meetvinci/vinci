import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import type * as UserTypes from '../../types/user.types';

export async function userActionUpdate(deps: UserTypes.UserServiceDeps, { id, by, ...changes }: UserTypes.UserUpdateParams): Promise<UserTypes.UserChanged> {
  const current = (await deps.provisioner.queries.list()).find((user) => user.id === id);

  if (!current) {
    throw new Errors.NOT_FOUND({
      resource: 'user',
      resourceId: id,
      internal: `No user ${id}`,
    });
  }

  const { state: _state, ...user } = { ...current, ...changes };
  const access = await deps.provisioner.actions.put({ user });
  const updated = (await deps.provisioner.queries.list()).find((listed) => listed.id === id);

  log.info({
    tag: 'hub',
    message: 'Admin updated a user',
    by,
    user: id,
    fields: Object.keys(changes),
    access,
  });

  if (!updated) {
    throw new Errors.INTERNAL_ERROR({ internal: `The provisioner did not list ${id} after updating it` });
  }

  return { ...updated, access };
}
