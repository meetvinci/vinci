import { defineExtension, GenerationTask, hook } from '@earendil-works/pi-durable';
import { runtimeClockStamp, runtimeClockTimezone } from './runtime-clock.utils';
import type { RuntimeClockParams } from '../../types/runtime.types';

export function runtimeClockExtension({ settings }: RuntimeClockParams) {
  return defineExtension({
    name: 'bots.clock',
    hooks: [hook(GenerationTask, {
      beforeRequest: async ({ messages }) => {
        const timezone = await runtimeClockTimezone(settings);

        // SAFETY: each user message gets the time it was sent, never the current time, so the request prefix stays the same from one request to the next and provider prompt caches stay warm.
        return { messages: messages.map((message) => runtimeClockStamp(message, timezone)) };
      },
    })],
  });
}
