import { ownerRouter } from './rpc.procedures';

export const plugins = {
  discover: ownerRouter.plugins.discover.handler(async ({ context, input }) => context.bots.queries.plugins(input)),
  settings: ownerRouter.plugins.settings.handler(async ({ context }) => context.plugins.queries.settings()),
  configure: ownerRouter.plugins.configure.handler(async ({ context, input }) => context.plugins.actions.configure(input)),
};
