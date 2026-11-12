import { ownerRouter } from './rpc.procedures';

export const avatars = {
  upload: ownerRouter.avatars.upload.handler(async ({ context, input }) => context.avatars.actions.upload(input)),
};
