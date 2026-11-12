import { match, P } from 'ts-pattern';
import { GLOBAL } from './global.constants';
import type * as GlobalTypes from '../../types/global.types';
import type { AdminGlobal } from '@repo/contracts/universal';

export async function globalQueryGlobal(deps: GlobalTypes.GlobalServiceDeps): Promise<AdminGlobal> {
  const template = await deps.users.queries.template();

  const state = await match(template)
    .with(P.nullish, async () => 'missing' as const)
    .otherwise(async (user) => deps.daemons.actions.resolve({ user }).then(() => 'ready' as const, () => 'starting' as const));

  return { sections: GLOBAL.sections, state };
}
