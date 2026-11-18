import { mcpFilesRead } from './mcp-files.utils';
import type { McpServiceDeps } from '../../types/mcp.types';
import type { BotGetInput, McpFile } from '@repo/contracts/universal';

export async function mcpQueryFile(deps: McpServiceDeps, { botId }: BotGetInput): Promise<McpFile> {
  return mcpFilesRead(deps, botId);
}
