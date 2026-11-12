import { ownerRouter } from './rpc.procedures';

export const devices = {
  list: ownerRouter.devices.list.handler(async ({ context }) => context.auth.queries.devices()),
  revoke: ownerRouter.devices.revoke.handler(async ({ context, input }) => context.auth.actions.revoke(input)),
};
