import type { McpClientServiceDeps, McpToolInfo, McpToolParams } from '../../types/mcp.types';

export function mcpQueryTool(deps: McpClientServiceDeps, { botId, name }: McpToolParams): McpToolInfo | undefined {
  for (const [key, connection] of deps.connections) {
    const index = key.startsWith(`${botId}:`) ? connection.tools.findIndex((tool) => tool.name === name) : -1;
    const tool = connection.definitions.at(index);

    if (index >= 0 && tool) {
      return { server: connection.server, key: connection.key, tool };
    }
  }

  return undefined;
}
