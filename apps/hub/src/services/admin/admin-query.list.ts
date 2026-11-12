import { adminActionReload } from './admin-action.reload';
import { ADMIN } from './admin.constants';
import type * as AdminTypes from '../../types/admin.types';

export async function adminQueryList(deps: AdminTypes.AdminServiceDeps): Promise<string[]> {
  if (Date.now() - deps.state.checkedAt > ADMIN.reloadCheckMs) {
    await adminActionReload(deps);
  }

  return deps.state.admins;
}
