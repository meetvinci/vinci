import { rm } from 'node:fs/promises';
import { mcpFilesDerivedRelease, mcpFilesOwnedPath, mcpFilesRead } from './mcp-files.utils';
import type { McpServiceDeps } from '../../types/mcp.types';
import type { BotGetInput } from '@repo/contracts/universal';

export async function mcpActionRelease(deps: McpServiceDeps, { botId }: BotGetInput) {
  await deps.clients.actions.prepare({ botId, config: { servers: [], diagnostics: [] } });

  const document = await mcpFilesRead(deps, botId);
  await mcpFilesDerivedRelease(deps, botId, Object.values(document.mcpServers));
  await rm(mcpFilesOwnedPath(deps, botId), { force: true });
}
