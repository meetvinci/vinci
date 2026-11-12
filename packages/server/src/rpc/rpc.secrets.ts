import { rpcTeamRefuse } from './rpc-team.utils';
import { localRouter, ownerRouter } from './rpc.procedures';

export const secrets = {
  list: ownerRouter.secrets.list.handler(async ({ context }) => context.secrets.queries.rules()),
  save: ownerRouter.secrets.save.handler(async ({ context, input }) => context.secrets.actions.save(input)),
  remove: ownerRouter.secrets.remove.handler(async ({ context, input }) => context.secrets.actions.remove(input)),
  settings: ownerRouter.secrets.settings.handler(async ({ context }) => context.secrets.queries.settings()),
  configure: ownerRouter.secrets.configure.handler(async ({ context, input }) => {
    await rpcTeamRefuse({
      context,
      path: 'secrets.configure',
      changes: async () => input.mode !== undefined && input.mode !== (await context.secrets.queries.settings()).mode,
    });
    return context.secrets.actions.configure(input);
  }),
  export: localRouter.secrets.export.handler(async ({ context }) => context.secrets.queries.export()),
};
