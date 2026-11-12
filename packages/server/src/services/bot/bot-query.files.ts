import { botQueryGet } from './bot-query.get';
import type { BotServiceDeps } from '../../types/bot.types';
import type { BotFiles, BotGetInput } from '@repo/contracts/universal';

export async function botQueryFiles(deps: BotServiceDeps, params: BotGetInput): Promise<BotFiles> {
  await botQueryGet(deps, params);

  const [files, mcp] = await Promise.all([
    deps.workspace.queries.botFiles(params),
    deps.mcp.queries.owned(params),
  ]);

  return { files, mcp };
}
