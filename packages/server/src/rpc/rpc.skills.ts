import { ownerRouter } from './rpc.procedures';

export const skills = {
  discover: ownerRouter.skills.discover.handler(async ({ context, input }) => context.bots.queries.skills(input)),
  shared: ownerRouter.skills.shared.handler(async ({ context, input }) => context.bots.queries.sharedSkills(input)),
  local: ownerRouter.skills.local.handler(async ({ context, input }) => context.bots.queries.localSkills(input)),
  settings: ownerRouter.skills.settings.handler(async ({ context }) => context.skills.queries.settings()),
  configure: ownerRouter.skills.configure.handler(async ({ context, input }) => context.skills.actions.configure(input)),
};
