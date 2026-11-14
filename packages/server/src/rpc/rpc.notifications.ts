import { authedRouter, ownerRouter } from './rpc.procedures';

export const notifications = {
  settings: ownerRouter.notifications.settings.handler(async ({ context }) => context.notifications.queries.settings()),
  configure: ownerRouter.notifications.configure.handler(async ({ context, input }) => context.notifications.actions.configure(input)),
  presence: authedRouter.notifications.presence.handler(async ({ context, input }) => {
    await context.notifications.actions.presence({ ...input, deviceId: context.device.id });
  }),
  push: authedRouter.notifications.push.handler(async ({ context, input }) => context.notifications.actions.push({ ...input, deviceId: context.device.id })),
  webPushKey: authedRouter.notifications.webPushKey.handler(async ({ context }) => context.notifications.queries.webPushKey()),
  webPush: authedRouter.notifications.webPush.handler(async ({ context, input }) => (
    context.notifications.actions.webPush({ ...input, deviceId: context.device.id })
  )),
};
