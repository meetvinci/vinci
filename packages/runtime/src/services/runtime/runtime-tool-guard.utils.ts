import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { MODEL_FAILURE } from '@repo/contracts/universal';
import { match } from 'ts-pattern';
import { runtimeModelStreamFailure } from './runtime-model-stream.utils';
import { RUNTIME_TOOL_GUARD } from './runtime.constants';
import type * as PiAiTypes from '@earendil-works/pi-ai';
import type { Models } from '@earendil-works/pi-ai/models';

export function runtimeToolGuardRefusal(messages: readonly PiAiTypes.Message[], call: PiAiTypes.ToolCall) {
  const { keys, results } = runtimeToolGuardTurn(messages);
  const key = keys.get(call.id) ?? runtimeToolGuardKey(call);
  const same = results.filter((result) => result.key === key);
  const sinceSuccess = [...same].reverse().findIndex((result) => !result.isError);
  const repeated = sinceSuccess === -1 ? same.length : sinceSuccess;
  const failed = results.filter((result) => result.isError).length;

  return match({ repeated, failed })
    .when(({ repeated: count }) => count >= RUNTIME_TOOL_GUARD.maxRepeatedFailures, () => (
      `${RUNTIME_TOOL_GUARD.refusalPrefix} This exact call already failed ${repeated} times in a row. Do not call it again. Tell the person in one or two sentences what failed and what they can do.`
    ))
    .when(({ failed: count }) => count >= RUNTIME_TOOL_GUARD.maxTurnFailures, () => (
      `${RUNTIME_TOOL_GUARD.refusalPrefix} ${failed} tool calls already failed in this turn. Call no more tools. Tell the person in one or two sentences what failed and what they can do.`
    ))
    .otherwise(() => undefined);
}

export function runtimeToolGuardStream(stream: Models['streamSimple']): Models['streamSimple'] {
  return (model, context, options) => {
    const refusals = runtimeToolGuardTurn(context.messages).results.filter((result) => result.isRefused).length;

    return match(refusals >= RUNTIME_TOOL_GUARD.maxRefusals)
      .with(true, () => {
        const output = createAssistantMessageEventStream();

        output.push(runtimeModelStreamFailure({
          api: model.api,
          provider: model.provider,
          model: model.id,
        }, options, MODEL_FAILURE.toolLoop));

        return output;
      })
      .otherwise(() => stream(model, context, options));
  };
}

function runtimeToolGuardTurn(messages: readonly PiAiTypes.Message[]) {
  const turn = messages.slice(messages.reduce((start, message, index) => (message.role === 'user' ? index + 1 : start), 0));

  const keys = new Map(turn.flatMap((message) => match(message)
    .with({ role: 'assistant' }, ({ content }) => content.flatMap((block) => match(block)
      .with({ type: 'toolCall' }, (call) => [[call.id, runtimeToolGuardKey(call)] as const])
      .otherwise(() => [])))
    .otherwise(() => [])));

  const results = turn.flatMap((message) => match(message)
    .with({ role: 'toolResult' }, ({ toolCallId, isError, content }) => [{
      key: keys.get(toolCallId),
      isError,
      isRefused: content.some((block) => block.type === 'text' && block.text.includes(RUNTIME_TOOL_GUARD.refusalPrefix)),
    }])
    .otherwise(() => []));

  return { keys, results };
}

function runtimeToolGuardKey({ name, arguments: args }: Pick<PiAiTypes.ToolCall, 'name' | 'arguments'>) {
  return `${name}:${JSON.stringify(args)}`;
}
