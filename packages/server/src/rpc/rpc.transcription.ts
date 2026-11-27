import { rpcTeamRefuse } from './rpc-team.utils';
import { authedRouter, localRouter, ownerRouter } from './rpc.procedures';

export const transcription = {
  settings: ownerRouter.transcription.settings.handler(async ({ context }) => context.transcription.queries.settings()),
  configure: ownerRouter.transcription.configure.handler(async ({ context, input }) => {
    await rpcTeamRefuse({
      context,
      path: 'transcription.configure',
      changes: async () => true,
    });
    return context.transcription.actions.configure(input);
  }),
  export: localRouter.transcription.export.handler(async ({ context }) => context.transcription.queries.export()),
  transcribe: authedRouter.transcription.transcribe.handler(async ({ context, input }) => context.transcription.actions.transcribe(input)),
};
