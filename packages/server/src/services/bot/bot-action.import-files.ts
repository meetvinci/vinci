import { botActionConfigure } from './bot-action.configure';
import { botQueryGet } from './bot-query.get';
import { botQueue } from './bot.utils';
import type { BotServiceDeps } from '../../types/bot.types';
import type { BotFilesImportInput } from '@repo/contracts/universal';

export async function botActionImportFiles(deps: BotServiceDeps, { botId, files, mcp }: BotFilesImportInput): Promise<void> {
  await botQueryGet(deps, { botId });
  await botQueue(deps, botId, async () => {
    await deps.workspace.actions.importBotFiles({ botId, files });
    await deps.mcp.actions.own({ botId, mcp });
  });
  await botActionConfigure(deps, { botId });
}
