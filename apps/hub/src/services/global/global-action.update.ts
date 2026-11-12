import { globalActionApply } from './global-action.apply';
import { globalActionReload } from './global-action.reload';
import { GLOBAL } from './global.constants';
import type * as GlobalTypes from '../../types/global.types';
import type { UserChanged, UserUpdateParams } from '../../types/user.types';

export async function globalActionUpdate(deps: GlobalTypes.GlobalServiceDeps, params: UserUpdateParams): Promise<UserChanged> {
  const updated = await deps.users.actions.update(params);

  await globalActionReload(deps);

  if (params.enabled === true && !deps.state.isBroken) {
    await globalActionApply(deps, {
      id: params.id,
      sections: GLOBAL.sections.map(({ id }) => id),
      by: params.by,
    });
  }

  return updated;
}
