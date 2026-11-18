import { mcpFilesRead, mcpFilesReferences } from './mcp-files.utils';
import { MCP } from './mcp.constants';
import type { McpServiceDeps } from '../../types/mcp.types';
import type { BotGetInput, McpOwned } from '@repo/contracts/universal';

export async function mcpQueryOwned(deps: McpServiceDeps, { botId }: BotGetInput): Promise<McpOwned> {
  const { mcpServers } = await mcpFilesRead(deps, botId);
  const prefix = `${MCP.derivedPrefix}${botId}.`;

  const keys = Object.values(mcpServers)
    .flatMap((entry) => mcpFilesReferences(entry))
    .map(({ key }) => key)
    .filter((key) => key.startsWith(prefix));

  const { get } = deps.credentials.queries;
  const values = await Promise.all(keys.map(async (key) => [key, await get({ key })] as const));

  return { mcpServers, credentials: Object.fromEntries(values.flatMap(([key, value]) => (value === null ? [] : [[key, value]]))) };
}
