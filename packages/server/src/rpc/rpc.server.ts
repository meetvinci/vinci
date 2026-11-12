import { ownerRouter } from './rpc.procedures';

export const rpcServer = {
  info: ownerRouter.server.info.handler(async ({ context }) => context.server.queries.info()),
  configure: ownerRouter.server.configure.handler(async ({ context, input }) => context.server.actions.configure(input)),
};
