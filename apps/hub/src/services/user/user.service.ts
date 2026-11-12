import { join } from 'node:path';
import { userActionCreate } from './user-action.create';
import { userActionReload } from './user-action.reload';
import { userActionRemove } from './user-action.remove';
import { userActionUpdate } from './user-action.update';
import { userQueryFind } from './user-query.find';
import { userQueryGet } from './user-query.get';
import { userQueryList } from './user-query.list';
import { USER } from './user.constants';
import type * as UserTypes from '../../types/user.types';

export async function makeUserService({ directory, ...services }: UserTypes.UserServiceParams): Promise<UserTypes.UserService> {
  const deps: UserTypes.UserServiceDeps = {
    ...services,
    path: join(directory, USER.file),
    state: {
      users: new Map(),
      mtimeMs: undefined,
      checkedAt: 0,
      creating: Promise.resolve(),
    },
  };

  await userActionReload(deps);

  return {
    queries: {
      find: (input) => userQueryFind(deps, input),
      get: (input) => userQueryGet(deps, input),
      list: () => userQueryList(deps),
    },
    actions: {
      create: (input) => userActionCreate(deps, input),
      update: (input) => userActionUpdate(deps, input),
      remove: (input) => userActionRemove(deps, input),
    },
  };
}
