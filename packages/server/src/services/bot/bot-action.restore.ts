import { log } from '@repo/logger/server';
import { botActionConfigure } from './bot-action.configure';
import { botQueryList } from './bot-query.list';
import type { BotServiceDeps } from '../../types/bot.types';

export async function botActionRestore(deps: BotServiceDeps) {
  const bots = await botQueryList(deps);

  await Promise.all(bots.map((bot) => botActionConfigure(deps, { botId: bot.id }).catch((error: unknown) => {
    log.error({
      tag: 'bot',
      message: 'Cannot configure a bot at start; it stays unavailable until the next start or until its settings are saved.',
      botId: bot.id,
      error,
    });
  })));
}
