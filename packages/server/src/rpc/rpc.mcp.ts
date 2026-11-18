import { rpcTeamRefuse } from './rpc-team.utils';
import { ownerRouter } from './rpc.procedures';

export const mcp = {
  discover: ownerRouter.mcp.discover.handler(async ({ context, input }) => context.bots.queries.mcp(input)),
  shared: ownerRouter.mcp.shared.handler(async ({ context, input }) => context.bots.queries.sharedMcp(input)),
  connect: ownerRouter.mcp.connect.handler(async ({ context, input }) => context.bots.actions.connectMcp(input)),
  add: ownerRouter.mcp.add.handler(async ({ context, input }) => {
    await rpcTeamRefuse({
      context,
      path: 'mcp.add',
      changes: () => input.command !== undefined,
    });
    return context.bots.actions.addMcp(input);
  }),
  remove: ownerRouter.mcp.remove.handler(async ({ context, input }) => context.bots.actions.removeMcp(input)),
  get: ownerRouter.mcp.get.handler(async ({ context, input }) => context.bots.queries.mcpFile(input)),
  replace: ownerRouter.mcp.replace.handler(async ({ context, input }) => {
    await rpcTeamRefuse({
      context,
      path: 'mcp.replace',
      changes: () => true,
    });
    return context.bots.actions.replaceMcp(input);
  }),
  settings: ownerRouter.mcp.settings.handler(async ({ context }) => context.mcp.queries.settings()),
  configure: ownerRouter.mcp.configure.handler(async ({ context, input }) => context.mcp.actions.configure(input)),
};
