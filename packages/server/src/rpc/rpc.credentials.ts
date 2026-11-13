import { rpcTeamRefuse } from './rpc-team.utils';
import { ownerRouter } from './rpc.procedures';

export const credentials = {
  list: ownerRouter.credentials.list.handler(async ({ context }) => context.credentials.queries.list()),
  set: ownerRouter.credentials.set.handler(async ({ context, input }) => {
    await rpcTeamRefuse({
      context,
      path: 'credentials.set',
      changes: async () => context.secrets.queries.isGlobalKey(input),
    });
    return context.credentials.actions.set(input);
  }),
};
