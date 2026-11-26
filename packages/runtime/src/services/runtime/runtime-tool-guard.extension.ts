import { defineExtension, hook, ToolTask } from '@earendil-works/pi-durable';
import { match, P } from 'ts-pattern';
import { runtimeToolGuardRefusal } from './runtime-tool-guard.utils';
import type { RuntimeToolGuardDeps } from '../../types/runtime.types';

export function runtimeToolGuardExtension({ harness }: RuntimeToolGuardDeps) {
  return defineExtension({
    name: 'bots.tool-guard',
    hooks: [hook(ToolTask, {
      beforeTool: async (call, api, context) => match(call.parent)
        .with(P.nonNullable, () => undefined)
        .otherwise(async () => {
          const conversation = await harness.conversation(api.conversationId, context);
          const view = await conversation?.context(context);
          const refusal = runtimeToolGuardRefusal(view?.messages ?? [], call);

          return match(refusal)
            .with(P.string, (block) => ({ block }))
            .otherwise(() => undefined);
        }),
    })],
  });
}
