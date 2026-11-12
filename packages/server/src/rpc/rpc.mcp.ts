import { ownerRouter } from './rpc.procedures';

export const mcp = {
  discover: ownerRouter.mcp.discover.handler(async ({ context, input }) => context.bots.queries.mcp(input)),
  shared: ownerRouter.mcp.shared.handler(async ({ context, input }) => context.bots.queries.sharedMcp(input)),
  connect: ownerRouter.mcp.connect.handler(async ({ context, input }) => context.bots.actions.connectMcp(input)),
  add: ownerRouter.mcp.add.handler(async ({ context, input }) => context.bots.actions.addMcp(input)),
  remove: ownerRouter.mcp.remove.handler(async ({ context, input }) => context.bots.actions.removeMcp(input)),
  settings: ownerRouter.mcp.settings.handler(async ({ context }) => context.mcp.queries.settings()),
  configure: ownerRouter.mcp.configure.handler(async ({ context, input }) => context.mcp.actions.configure(input)),
};
