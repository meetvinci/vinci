import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { USER } from './user.constants';
import { userAccountUndo, userNewId } from './user.utils';
import type * as UserTypes from '../../types/user.types';

export async function userActionCreate(deps: UserTypes.UserServiceDeps, { name, email, by }: Omit<UserTypes.UserCreateParams, 'bots'>): Promise<UserTypes.UserChanged> {
  const created = deps.state.creating.then(async () => {
    const users = await deps.provisioner.queries.list();

    if (users.some((user) => user.email === email)) {
      throw new Errors.CONFLICT({ internal: `A user already has ${email}` });
    }

    const id = userNewId(name, email, new Set([...users.map((user) => user.id), ...deps.daemons.queries.pinned(), ...USER.reservedIds]));

    const target = {
      email,
      userId: id,
      by,
    };

    const account = await deps.accounts.actions.put({ ...target, name });

    await deps.provisioner.actions.put({ user: { id, name, email, enabled: true, advanced: false } }).catch(async (error: unknown) => {
      await userAccountUndo(deps, { ...target, account });
      throw error;
    });

    const listed = (await deps.provisioner.queries.list()).find((user) => user.id === id);

    log.info({
      tag: 'hub',
      message: 'Admin created a user',
      by,
      user: id,
      account: account.created,
    });

    if (!listed) {
      throw new Errors.INTERNAL_ERROR({ internal: `The provisioner did not list ${id} after creating it` });
    }

    return { ...listed, password: account.password };
  });

  deps.state.creating = created.then(() => undefined, () => undefined);

  return created;
}
