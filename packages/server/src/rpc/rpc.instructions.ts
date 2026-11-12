import { ownerRouter } from './rpc.procedures';

export const instructions = {
  discover: ownerRouter.instructions.discover.handler(async ({ context, input }) => context.bots.queries.instructions(input)),
  settings: ownerRouter.instructions.settings.handler(async ({ context }) => context.instructions.queries.settings()),
  configure: ownerRouter.instructions.configure.handler(async ({ context, input }) => context.instructions.actions.configure(input)),
};
