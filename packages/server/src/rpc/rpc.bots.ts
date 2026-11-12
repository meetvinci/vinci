import { authedRouter, ownerRouter } from './rpc.procedures';

export const bots = {
  swapModels: ownerRouter.bots.swapModels.handler(async ({ context, input }) => context.bots.actions.swapModels(input)),
  list: ownerRouter.bots.list.handler(async ({ context }) => context.bots.queries.list()),
  get: ownerRouter.bots.get.handler(async ({ context, input }) => context.bots.queries.get(input)),
  create: ownerRouter.bots.create.handler(async ({ context, input }) => context.bots.actions.create(input)),
  update: ownerRouter.bots.update.handler(async ({ context, input }) => context.bots.actions.update(input)),
  delete: ownerRouter.bots.delete.handler(async ({ context, input }) => context.bots.actions.delete(input)),
  catalog: ownerRouter.bots.catalog.handler(async ({ context, input }) => context.bots.queries.catalog(input)),
  usage: authedRouter.bots.usage.handler(async ({ context, input }) => context.bots.queries.usage(input)),
};
