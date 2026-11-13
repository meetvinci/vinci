import { botQueryModelSettings } from './bot-query.model-settings';
import { BOT } from './bot.constants';
import type { BotServiceDeps } from '../../types/bot.types';
import type { ModelSettings } from '@repo/contracts/universal';

export async function botActionConfigureModels(deps: BotServiceDeps, { defaultModel }: ModelSettings): Promise<ModelSettings> {
  await deps.settings.actions.set({ records: [{ key: BOT.defaultModelSetting, value: JSON.stringify(defaultModel) }] });

  return botQueryModelSettings(deps);
}
