import { userActionReload } from './user-action.reload';
import { USER } from './user.constants';
import type * as UserTypes from '../../types/user.types';

export async function userQueryFind(deps: UserTypes.UserServiceDeps, { email }: UserTypes.UserFindParams): Promise<UserTypes.User | null> {
  if (Date.now() - deps.state.checkedAt > USER.reloadCheckMs) {
    await userActionReload(deps);
  }

  return deps.state.users.get(email.toLowerCase()) ?? null;
}
