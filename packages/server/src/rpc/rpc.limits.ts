import { rpcTeamRefuse } from './rpc-team.utils';
import { ownerRouter } from './rpc.procedures';

export const limits = {
  settings: ownerRouter.limits.settings.handler(async ({ context }) => context.limits.queries.settings()),
  configure: ownerRouter.limits.configure.handler(async ({ context, input }) => {
    await rpcTeamRefuse({
      context,
      path: 'limits.configure',
      changes: () => true,
    });
    return context.limits.actions.configure(input);
  }),
};
