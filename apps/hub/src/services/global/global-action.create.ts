import { globalActionApply } from './global-action.apply';
import { globalActionBots } from './global-action.bots';
import { globalActionSave } from './global-action.save';
import { GLOBAL } from './global.constants';
import { globalFollowing } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';
import type { UserCreateParams } from '../../types/user.types';

export async function globalActionCreate(deps: GlobalTypes.GlobalServiceDeps, { bots, ...params }: UserCreateParams): Promise<GlobalTypes.GlobalCreated> {
  const created = await deps.users.actions.create(params);
  const sections = GLOBAL.sections.map(({ id }) => id);

  await globalActionSave(deps, {
    change: (file) => ({
      users: { ...file.users, [created.id]: globalFollowing() },
    }),
  });
  await globalActionApply(deps, {
    id: created.id,
    sections,
    by: params.by,
  });

  const copies = bots && bots.length > 0 ? await globalActionBots(deps, {
    id: created.id,
    bots,
    by: params.by,
  }) : [];

  return { ...created, bots: copies };
}
