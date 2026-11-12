import { ownerRouter } from './rpc.procedures';

export const credentials = {
  list: ownerRouter.credentials.list.handler(async ({ context }) => context.credentials.queries.list()),
  set: ownerRouter.credentials.set.handler(async ({ context, input }) => context.credentials.actions.set(input)),
};
