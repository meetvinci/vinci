import { isDeepStrictEqual } from 'node:util';
import { rpcTeamRefuse } from './rpc-team.utils';
import { authedRouter, localRouter, ownerRouter } from './rpc.procedures';

export const tools = {
  settings: ownerRouter.tools.settings.handler(async ({ context }) => context.tools.queries.settings()),
  configure: ownerRouter.tools.configure.handler(async ({ context, input }) => {
    await rpcTeamRefuse({
      context,
      path: 'tools.configure',
      changes: async () => {
        const current = await context.tools.queries.settings();

        return (input.approvalRules !== undefined && !isDeepStrictEqual(input.approvalRules, current.approvalRules))
          || (input.approvalTimeoutMinutes !== undefined && input.approvalTimeoutMinutes !== current.approvalTimeoutMinutes);
      },
    });
    return context.tools.actions.configure(input);
  }),
  export: localRouter.tools.export.handler(async ({ context }) => context.tools.queries.export()),
  pending: authedRouter.tools.pending.handler(async ({ context, input }) => context.conversation.queries.approvals(input)),
  alwaysAllowed: ownerRouter.tools.alwaysAllowed.handler(async ({ context, input }) => context.tools.queries.alwaysAllowed(input)),
  clearAlwaysAllowed: ownerRouter.tools.clearAlwaysAllowed.handler(async ({ context, input }) => context.tools.actions.clearAlwaysAllowed(input)),
  answer: authedRouter.tools.answer.handler(async ({ context, input }) => (
    context.conversation.actions.approve({ ...input, answeredBy: context.device.id })
  )),
};
