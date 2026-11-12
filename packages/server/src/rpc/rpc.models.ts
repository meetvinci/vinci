import { ownerRouter } from './rpc.procedures';

export const models = {
  list: ownerRouter.models.list.handler(async ({ context }) => context.runtime.queries.models()),
};
