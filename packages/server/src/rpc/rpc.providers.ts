import { localRouter, ownerRouter } from './rpc.procedures';

export const providers = {
  list: ownerRouter.providers.list.handler(async ({ context }) => context.providers.queries.list({ deviceId: context.device?.id ?? null })),
  login: ownerRouter.providers.login.handler(async ({ context, input }) => context.providers.actions.login({
    ...input,
    deviceId: context.device?.id ?? null,
    serverId: (await context.server.queries.info()).id,
  })),
  complete: ownerRouter.providers.complete.handler(async ({ context, input }) => context.providers.actions.complete({
    ...input,
    deviceId: context.device?.id ?? null,
  })),
  session: ownerRouter.providers.session.handler(async ({ context, input }) => context.providers.queries.session({
    ...input,
    deviceId: context.device?.id ?? null,
  })),
  cancel: ownerRouter.providers.cancel.handler(async ({ context, input }) => context.providers.actions.cancel({
    ...input,
    deviceId: context.device?.id ?? null,
  })),
  logout: ownerRouter.providers.logout.handler(async ({ context, input }) => context.providers.actions.logout(input)),
  export: localRouter.providers.export.handler(async ({ context }) => context.providers.queries.export()),
  import: localRouter.providers.import.handler(async ({ context, input }) => context.providers.actions.import(input)),
};
