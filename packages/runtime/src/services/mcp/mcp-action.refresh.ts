import type { McpClientServiceDeps } from '../../types/mcp.types';
import type { BotGetInput } from '@repo/contracts/universal';

export function mcpActionRefresh(deps: McpClientServiceDeps, { botId }: BotGetInput) {
  for (const [key, connection] of deps.connections) {
    if (key.startsWith(`${botId}:`)) {
      connection.hasToolChanges = true;
    }
  }
}
