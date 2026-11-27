import { authedRouter } from './rpc.procedures';

export const speech = {
  speak: authedRouter.speech.speak.handler(({ context, input, signal }) => context.speech.actions.speak({ ...input, signal })),
};
