import { mcpActionPrepare } from './mcp-action.prepare';
import { mcpActionRefresh } from './mcp-action.refresh';
import { mcpQueryCatalog } from './mcp-query.catalog';
import type { McpClientParams, McpClientServiceDeps } from '../../types/mcp.types';
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
