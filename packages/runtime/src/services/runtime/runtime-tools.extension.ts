import { defineExtension, hook, ToolTask } from '@earendil-works/pi-durable';
import { TOOL_APPROVAL } from '@repo/contracts/universal';
import { match, P } from 'ts-pattern';
import { runtimeActionRequestApproval } from './runtime-action.request-approval';
import { runtimeBot } from './runtime.constants';
import type { RuntimeToolsDeps } from '../../types/runtime.types';

export function runtimeToolsExtension({ harness, readOnlyTools, ownTools, sandboxTools, permissions }: RuntimeToolsDeps) {
  return defineExtension({
    name: 'bots.tools',
    hooks: [hook(ToolTask, {
      beforeTool: async (call, api, context) => {
        const bot = await api.snapshot(runtimeBot, api.conversationId, context);

        return match(bot?.botId)
          .with(P.string, async (botId) => {
            const conversation = await harness.conversation(api.conversationId, context);
            const agent = await conversation?.agent(context);
            const tools = [...(agent?.tools ?? []), ...(agent?.callable ?? []), ...(agent?.deferred ?? [])];
            const tool = tools.find((candidate) => candidate.name === call.name);

            const input = {
              botId,
              taskId: api.taskId,
              name: call.name,
              arguments: call.arguments,
              isReadOnly: tool !== undefined && readOnlyTools.includes(tool),
              isOwn: tool !== undefined && ownTools.includes(tool),
              isSandboxed: tool !== undefined && sandboxTools.includes(tool),
              getRequest: async () => {
                const view = await conversation?.context(context);
                const message = [...(view?.messages ?? [])].reverse().find((item) => item.role === 'user');

                return match(message?.content)
                  .with(P.string, (text) => text)
                  .with(P.array(), (parts) => parts.flatMap((part) => (
                    match(part)
                      .with({ type: 'text' }, ({ text }) => [text])
                      .otherwise(() => [])
                  )).join('\n'))
                  .otherwise(() => '');
              },
            };

            const decision = await permissions.authorize(input, context);

            context.abortSignal?.throwIfAborted();

            const outcome = await match(decision)
              .with('allow', () => 'allowed' as const)
              .with('deny', () => 'denied' as const)
              .with('ask', async () => {
                const status = await runtimeActionRequestApproval({ harness }, {
                  call: input,
                  taskId: api.taskId,
                  timeoutMs: await permissions.approvalTimeoutMs(),
                  context,
                });

                return status === 'allowed' && await permissions.authorize({ ...input, approved: true }, context) !== 'allow' ? 'denied' as const : status;
              })
              .exhaustive();

            return match(outcome)
              .with('allowed', () => undefined)
              .with('expired', () => ({ block: TOOL_APPROVAL.expiredResult }))
              .with('denied', () => ({ block: 'Tool permission was denied.' }))
              .exhaustive();
          })
          .otherwise(() => ({ block: 'This conversation has no bot identity.' }));
      },
    })],
  });
}
