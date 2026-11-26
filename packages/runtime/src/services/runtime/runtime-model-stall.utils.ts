import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { MODEL_FAILURE } from '@repo/contracts/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import { runtimeModelStreamFailure } from './runtime-model-stream.utils';
import { RUNTIME_MODEL_STALL } from './runtime.constants';
import type { RuntimeModelStallRequest, RuntimeModelStallState } from '../../types/runtime-model.types';
import type { Models } from '@earendil-works/pi-ai/models';

export function runtimeModelStall(stream: Models['streamSimple']): Models['streamSimple'] {
  return (model, context, options) => {
    const output = createAssistantMessageEventStream();

    void runtimeModelStallAttempt({
      stream,
      model,
      context,
      options,
      output,
    }, 0).catch(() => {
      output.push(runtimeModelStreamFailure({
        api: model.api,
        provider: model.provider,
        model: model.id,
      }, options));
    });

    return output;
  };
}

async function runtimeModelStallAttempt(request: RuntimeModelStallRequest, attempt: number): Promise<void> {
  const { stream, model, context, options, output } = request;
  const controller = new AbortController();
  const state: RuntimeModelStallState = { isStalled: false, partial: undefined, timer: undefined };

  const signal = match(options?.signal)
    .with(P.nonNullable, (outer) => AbortSignal.any([outer, controller.signal]))
    .otherwise(() => controller.signal);

  const runtimeModelStallArm = () => {
    clearTimeout(state.timer);

    state.timer = setTimeout(() => {
      state.isStalled = true;
      controller.abort();
    }, RUNTIME_MODEL_STALL.timeoutMs);
  };

  const events = stream(model, context, {
    ...options,
    signal,
    onProviderStreamEvent: async (data, source) => {
      runtimeModelStallArm();
      await options?.onProviderStreamEvent?.(data, source);
    },
  });

  runtimeModelStallArm();

  try {
    for await (const event of events) {
      runtimeModelStallArm();

      if (!state.isStalled && (event.type !== 'start' || attempt === 0)) {
        output.push(event);
      }

      if (event.type !== 'done' && event.type !== 'error') {
        state.partial = event.partial;
      }
    }
  } finally {
    clearTimeout(state.timer);
  }

  const canRetry = attempt < RUNTIME_MODEL_STALL.retries && !options?.signal?.aborted && !state.partial?.content.length;

  await match({ isStalled: state.isStalled, canRetry })
    .with({ isStalled: false }, () => undefined)
    .with({ canRetry: true }, () => {
      log.warn({
        tag: 'runtime-model',
        message: 'The model stopped responding; sending the request again.',
        provider: model.provider,
        model: model.id,
      });

      return runtimeModelStallAttempt(request, attempt + 1);
    })
    .otherwise(() => {
      log.warn({
        tag: 'runtime-model',
        message: 'The model stopped responding; ending the run.',
        provider: model.provider,
        model: model.id,
      });

      output.push(runtimeModelStallFailure(request, state));
    });
}

function runtimeModelStallFailure({ model, options }: RuntimeModelStallRequest, { partial }: RuntimeModelStallState) {
  const failure = runtimeModelStreamFailure({
    api: model.api,
    provider: model.provider,
    model: model.id,
  }, options, MODEL_FAILURE.stalled);

  return match(failure)
    .with({ type: 'error', reason: 'error' }, ({ error }) => ({ ...failure, error: { ...error, ...partial, stopReason: error.stopReason, errorMessage: error.errorMessage } }))
    .otherwise(() => failure);
}
