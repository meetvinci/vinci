import { ownerRouter } from './rpc.procedures';

export const mcpAuth = {
  start: ownerRouter.mcpAuth.start.handler(async ({ context, input }) => context.mcpAuth.actions.start({
    ...input,
    deviceId: context.device?.id ?? null,
    authorization: context.reqHeaders?.get('authorization'),
  })),
  complete: ownerRouter.mcpAuth.complete.handler(async ({ context, input }) => context.mcpAuth.actions.complete({
    ...input,
    deviceId: context.device?.id ?? null,
  })),
  cancel: ownerRouter.mcpAuth.cancel.handler(async ({ context, input }) => context.mcpAuth.actions.cancel({ ...input, deviceId: context.device?.id ?? null })),
  logout: ownerRouter.mcpAuth.logout.handler(async ({ context, input }) => context.mcpAuth.actions.logout(input)),
  status: ownerRouter.mcpAuth.status.handler(async ({ context, input }) => context.mcpAuth.queries.status({ ...input, deviceId: context.device?.id ?? null })),
};
