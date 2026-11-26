import type { McpClientServiceDeps, McpServerTools } from '../../types/mcp.types';

export function mcpQueryServers(deps: McpClientServiceDeps): McpServerTools[] {
  const servers = new Map<string, McpServerTools>();

  for (const connection of deps.connections.values()) {
    const server = servers.get(connection.key) ?? { key: connection.key, names: [], tools: [] };
    const known = new Set(server.tools.map((tool) => tool.name));

    servers.set(connection.key, {
      key: connection.key,
      names: [...new Set([...server.names, connection.server])],
      tools: [...server.tools, ...connection.definitions.filter((tool) => !known.has(tool.name))],
    });
  }

  return [...servers.values()];
}
