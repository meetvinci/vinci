import { Errors } from '@repo/errors/universal';
import { match, P } from 'ts-pattern';
import { botActionConfigure } from './bot-action.configure';
import { botActionStart } from './bot-action.start';
import { botValues } from './bot.utils';
import type { BotCreateParams, BotServiceDeps } from '../../types/bot.types';

export async function botActionCreate(deps: BotServiceDeps, { canStart, ...params }: BotCreateParams) {
  deps.runtime.queries.validateModel(params);

  const botId = await deps.database.db.transaction().execute(async (tx) => {
    const now = Date.now();

    const saved = await tx.insertInto('bot')
      .values({
        ...botValues(params),
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((conflict) => conflict.column('handle').doNothing())
      .returning('id').executeTakeFirst();

    const id = match(saved)
      .with(P.nonNullable, (value) => value.id)
      .otherwise(() => {
        throw new Errors.CONFLICT();
      });

    await match(!canStart && Boolean(params.instructions.trim()))
      .with(true, () => tx.insertInto('botStart').values({ botId: id }).execute())
      .with(false, () => undefined)
      .exhaustive();

    // SAFETY: the folder is made before the row commits, so a full disk never leaves a bot without one.
    await deps.workspace.actions.prepareDirectory({ botId: id });

    return id;
  });

  for (const listener of deps.changes) {
    listener();
  }

  const bot = await botActionConfigure(deps, { botId });

  if (canStart && bot.instructions.trim()) {
    await botActionStart(deps, { botId });
  }

  return bot;
}
