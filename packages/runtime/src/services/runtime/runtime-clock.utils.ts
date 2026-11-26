import { match, P } from 'ts-pattern';
import { RUNTIME_CLOCK } from './runtime-clock.constants';
import type { RuntimeSettings } from '../../types/runtime.types';
import type { Message } from '@earendil-works/pi-ai';

export async function runtimeClockTimezone(settings: RuntimeSettings) {
  const stored = await settings.queries.get({ keys: [RUNTIME_CLOCK.timezoneSetting] });

  return stored.at(0)?.value ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function runtimeClockStamp(message: Message, timezone: string): Message {
  return match(message)
    .with({ role: 'user' }, (user) => {
      const note = runtimeClockNote(user.timestamp, timezone);

      return {
        ...user,
        content: match(user.content)
          .with(P.string, (text) => `${note}\n\n${text}`)
          .otherwise((parts) => [{ type: 'text' as const, text: note }, ...parts]),
      };
    })
    .otherwise(() => message);
}

function runtimeClockNote(timestamp: number, timezone: string) {
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(timestamp);

  return `[Sent ${local}, ${timezone} time; ${new Date(timestamp).toISOString()}, epoch ms ${timestamp}]`;
}
