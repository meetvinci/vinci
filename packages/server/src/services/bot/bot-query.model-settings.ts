import { modelSettings } from '@repo/contracts/universal';
import { BOT } from './bot.constants';
import type { BotServiceDeps } from '../../types/bot.types';
import type { ModelSettings } from '@repo/contracts/universal';

export async function botQueryModelSettings({ settings }: BotServiceDeps): Promise<ModelSettings> {
  const stored = (await settings.queries.get({ keys: [BOT.defaultModelSetting] })).at(0)?.value;

  return { defaultModel: modelSettings.shape.defaultModel.catch(null).parse(stored ? JSON.parse(stored) : null) };
}
