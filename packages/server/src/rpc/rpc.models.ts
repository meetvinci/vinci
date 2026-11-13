import { isDeepStrictEqual } from 'node:util';
import { rpcTeamRefuse } from './rpc-team.utils';
import { ownerRouter } from './rpc.procedures';

export const models = {
  list: ownerRouter.models.list.handler(async ({ context }) => context.runtime.queries.models()),
  settings: ownerRouter.models.settings.handler(async ({ context }) => context.bots.queries.modelSettings()),
  configure: ownerRouter.models.configure.handler(async ({ context, input }) => {
    await rpcTeamRefuse({
      context,
      path: 'models.configure',
      changes: async () => !isDeepStrictEqual(input, await context.bots.queries.modelSettings()),
    });
    return context.bots.actions.configureModels(input);
  }),
};
