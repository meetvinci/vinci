import { match, P } from 'ts-pattern';
import { botActionStart } from './bot-action.start';
import { botQueue } from './bot.utils';
import type { BotServiceDeps } from '../../types/bot.types';
import type { BotGetInput } from '@repo/contracts/universal';

export function botActionOpen(deps: BotServiceDeps, { botId }: BotGetInput) {
  return botQueue(deps, botId, async () => {
    const pending = await deps.database.db.selectFrom('botStart')
      .innerJoin('bot', 'bot.id', 'botStart.botId')
      .select('bot.instructions')
      .where('botStart.botId', '=', botId)
      .executeTakeFirst();

    await match(pending)
      .with(P.nonNullable, async ({ instructions }) => {
        const history = await deps.runtime.queries.history({ botId, limit: 1 });

        await match(Boolean(instructions.trim()) && history.items.length === 0)
          .with(true, () => botActionStart(deps, { botId }))
          .with(false, () => undefined)
          .exhaustive();

        await deps.database.db.deleteFrom('botStart').where('botId', '=', botId).execute();
      })
      .otherwise(() => undefined);
  });
}
