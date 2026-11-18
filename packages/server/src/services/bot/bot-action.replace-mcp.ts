import { botActionConnectMcp } from './bot-action.connect-mcp';
import { botQueryGet } from './bot-query.get';
import { botQueue } from './bot.utils';
import type { BotServiceDeps } from '../../types/bot.types';
import type { McpReplaceInput } from '@repo/contracts/universal';

export async function botActionReplaceMcp(deps: BotServiceDeps, params: McpReplaceInput) {
  await botQueryGet(deps, params);
  await botQueue(deps, params.botId, () => deps.mcp.actions.replace(params));

  return botActionConnectMcp(deps, { botId: params.botId });
}
