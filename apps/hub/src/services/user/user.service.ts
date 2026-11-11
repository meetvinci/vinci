import { join } from 'node:path';
import { userActionReload } from './user-action.reload';
import { userQueryFind } from './user-query.find';
import { USER } from './user.constants';
import type * as UserTypes from '../../types/user.types';

export async function makeUserService({ directory }: UserTypes.UserServiceParams): Promise<UserTypes.UserService> {
  const deps: UserTypes.UserServiceDeps = { path: join(directory, USER.file), state: { users: new Map(), mtimeMs: undefined, checkedAt: 0 } };

  await userActionReload(deps);

  return {
    queries: {
      find: (input) => userQueryFind(deps, input),
    },
  };
}
