import { authedRouter, ownerRouter } from './rpc.procedures';

export const commands = {
  list: authedRouter.commands.list.handler(async ({ context, input }) => context.conversation.queries.commands(input)),
  execute: ownerRouter.commands.execute.handler(async ({ context, input }) => context.conversation.actions.executeCommand(input)),
};
