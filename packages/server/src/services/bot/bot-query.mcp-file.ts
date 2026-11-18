import { botQueryGet } from './bot-query.get';
import type { BotServiceDeps } from '../../types/bot.types';
import type { BotGetInput } from '@repo/contracts/universal';

export async function botQueryMcpFile(deps: BotServiceDeps, params: BotGetInput) {
  await botQueryGet(deps, params);
  return deps.mcp.queries.file(params);
}
