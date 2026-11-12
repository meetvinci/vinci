import { localRouter } from './rpc.procedures';

export const workspace = {
  export: localRouter.workspace.export.handler(async ({ context }) => context.workspace.queries.export()),
  import: localRouter.workspace.import.handler(async ({ context, input }) => context.workspace.actions.import(input)),
};
