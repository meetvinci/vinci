import { ownerRouter } from './rpc.procedures';

export const onboarding = {
  state: ownerRouter.onboarding.state.handler(async ({ context }) => context.onboarding.queries.state()),
  complete: ownerRouter.onboarding.complete.handler(async ({ context }) => context.onboarding.actions.complete()),
};
