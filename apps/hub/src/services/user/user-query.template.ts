import { userActionReload } from './user-action.reload';
import { USER } from './user.constants';
import type * as UserTypes from '../../types/user.types';

export async function userQueryTemplate(deps: UserTypes.UserServiceDeps): Promise<UserTypes.UserDaemon | null> {
  if (Date.now() - deps.state.checkedAt > USER.reloadCheckMs) {
    await userActionReload(deps);
  }

  return deps.state.template;
}
