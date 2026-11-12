import { userActionReload } from './user-action.reload';
import { USER } from './user.constants';
import type * as UserTypes from '../../types/user.types';

export async function userQueryGet(deps: UserTypes.UserServiceDeps, { id }: UserTypes.UserGetParams): Promise<UserTypes.User | null> {
  if (Date.now() - deps.state.checkedAt > USER.reloadCheckMs) {
    await userActionReload(deps);
  }

  return [...deps.state.users.values()].find((user) => user.id === id) ?? null;
}
