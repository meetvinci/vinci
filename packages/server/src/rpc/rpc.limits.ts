import { rpcTeamRefuse } from './rpc-team.utils';
import { authedRouter } from './rpc.procedures';

export const limits = {
  settings: authedRouter.limits.settings.handler(async ({ context }) => context.limits.queries.settings()),
  configure: authedRouter.limits.configure.handler(async ({ context, input }) => {
    await rpcTeamRefuse({
      context,
      path: 'limits.configure',
      changes: () => true,
    });
    return context.limits.actions.configure(input);
  }),
};
