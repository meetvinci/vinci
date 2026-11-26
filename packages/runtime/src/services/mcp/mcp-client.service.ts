import { mcpActionPrepare } from './mcp-action.prepare';
import { mcpActionRefresh } from './mcp-action.refresh';
import { mcpQueryCatalog } from './mcp-query.catalog';
import { mcpQueryServers } from './mcp-query.servers';
import { mcpQueryTool } from './mcp-query.tool';
import type { McpClientParams, McpClientServiceDeps, McpToolParams } from '../../types/mcp.types';
import type { BotGetInput } from '@repo/contracts/universal';

export function makeMcpClientService({ root, auth, executionEnv }: Omit<McpClientServiceDeps, 'connections'>) {
  const deps: McpClientServiceDeps = { root, auth, executionEnv, connections: new Map() };

  return {
    actions: {
      refresh: (params: BotGetInput) => mcpActionRefresh(deps, params),
      prepare: (params: McpClientParams) => mcpActionPrepare(deps, params),
    },
    queries: {
      catalog: (params: McpClientParams) => mcpQueryCatalog(deps, params),
      tool: (params: McpToolParams) => mcpQueryTool(deps, params),
      servers: () => mcpQueryServers(deps),
    },
    close: async () => {
      const connections = [...deps.connections.values()];
      deps.connections.clear();
      await Promise.all(connections.map(async ({ client, ready }) => {
        await client.close();
        await ready;
      }));
    },
  };
}

export type McpClientService = ReturnType<typeof makeMcpClientService>;
