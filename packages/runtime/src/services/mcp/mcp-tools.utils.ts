import { Type } from '@earendil-works/pi-ai';
import { defineTool } from '@earendil-works/pi-durable';
import { McpConnectionClosedError } from '@earendil-works/pi-mcp';
import * as m from '@repo/i18n/messages';
import { match, P } from 'ts-pattern';
import { mcpContent } from './mcp-content.utils';
import { MCP } from './mcp.constants';
import { mcpToolName } from './mcp.utils';
import type { McpConnection, McpContentTarget } from '../../types/mcp.types';
import type { JsonObject } from '@earendil-works/pi-durable';
import type { Tool } from '@earendil-works/pi-mcp';

export function mcpTools(connection: McpConnection, server: string, tools: Tool[], target: McpContentTarget) {
  return tools.map((tool) => defineTool({
    name: mcpToolName(server, tool.name, `${connection.fingerprint}:${JSON.stringify(tool)}`),
    description: tool.description ?? tool.name,
    parameters: Type.Unsafe<JsonObject>({
      ...tool.inputSchema,
      type: 'object',
      properties: tool.inputSchema.properties ?? {},
    }),
    deferred: true,
    replay: 'unsafe',
    execute: async (args, api, context) => {
      try {
        const result = await connection.client.callTool(tool.name, args, {
          signal: context.abortSignal,
          timeoutMs: 60_000,
          onProgress: ({ progress, total }) => api.output(`MCP progress: ${progress}${total === undefined ? '' : `/${total}`}\n`),
        });

        const diagnostics = match(result._meta?.[MCP.truncatedMeta])
          .with({ droppedBytes: P.number, droppedLines: P.number }, ({ droppedBytes, droppedLines }) => [{
            severity: 'warn' as const,
            code: 'truncated',
            message: `Output truncated to its beginning: ${droppedLines} lines, ${droppedBytes} bytes dropped`,
          }])
          .otherwise(() => undefined);

        return { output: await mcpContent(target, result), isError: result.isError === true, diagnostics };
      } catch (error) {
        context.abortSignal?.throwIfAborted();
        const text = connection.error ?? (error instanceof McpConnectionClosedError ? m.ui_mcp_server_stopped() : 'MCP tool call failed.');
        return { output: [{ type: 'text' as const, text }], isError: true };
      }
    },
  }));
}
