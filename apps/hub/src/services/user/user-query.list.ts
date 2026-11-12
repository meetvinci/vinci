import { userActionReload } from './user-action.reload';
import { USER } from './user.constants';
import type { ProvisionerUser } from '../../types/provisioner.types';
import type * as UserTypes from '../../types/user.types';

export async function userQueryList(deps: UserTypes.UserServiceDeps): Promise<ProvisionerUser[]> {
  if (deps.provisioner.queries.isConfigured()) {
    return deps.provisioner.queries.list();
  }

  if (Date.now() - deps.state.checkedAt > USER.reloadCheckMs) {
    await userActionReload(deps);
  }

  return [...deps.state.users.values()].map(({ id, email, advanced }) => ({
    id,
    name: id,
    email,
    enabled: true,
    advanced: advanced === true,
    state: 'unknown',
  }));
}
