import { match, P } from 'ts-pattern';
import { RUNTIME_CLOCK } from '@repo/runtime/server';
import { conversationQuerySettings } from './conversation-query.settings';
import type { ConversationServiceDeps } from '../../types/conversation.types';
import type { ConversationSubmitInput } from '@repo/contracts/universal';

export async function conversationActionSubmit(
  deps: ConversationServiceDeps,
  { content, skills, attachmentIds, timezone, ...params }: ConversationSubmitInput,
) {
  const { runtime, bots, skill, attachments, settings } = deps;

  await bots.queries.get({ botId: params.botId });
  await settings.actions.set({ records: timezone ? [{ key: RUNTIME_CLOCK.timezoneSetting, value: timezone }] : [] });
  const existing = await runtime.queries.submission(params);

  return match(existing)
    .with(P.nonNullable, (submissionId) => ({ submissionId }))
    .otherwise(async () => {
      const bot = await bots.actions.configure({ botId: params.botId });

      const selected = await match(skills ?? [])
        .with([], () => undefined)
        .otherwise(async (names) => ({ names, prompt: (await skill.queries.expand({ bot, names })).prompt }));

      const files = await attachments.actions.prepare({ ...params, attachmentIds });
      const preferences = await bots.queries.preferences();

      const submission = await runtime.actions.submit({
        ...params,
        whenBusy: params.whenBusy ?? preferences.get(params.botId)?.whenBusy ?? (await conversationQuerySettings(deps)).whenBusy,
        content,
        skills: selected,
        attachments: files,
      });

      return { submissionId: submission.id };
    });
}
