import { McpAuthRequiredError, McpClient, StdioTransport, StreamableHttpTransport } from '@earendil-works/pi-mcp';
import { Errors } from '@repo/errors/universal';
import * as m from '@repo/i18n/messages';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { match, P } from 'ts-pattern';
import { mcpTools } from './mcp-tools.utils';
import { mcpTransportSandbox } from './mcp-transport.utils';
import { MCP } from './mcp.constants';
import { mcpFingerprint } from './mcp.utils';
import type { McpClientServiceDeps, McpConnection, McpConnectParams } from '../../types/mcp.types';

export async function mcpActionConnect(deps: McpClientServiceDeps, { botId, entry }: McpConnectParams) {
  const key = `${botId}:${entry.name}`;
  const fingerprint = mcpFingerprint(entry);
  const sourceFingerprint = entry.sourceFingerprint ?? fingerprint;
  const previous = deps.connections.get(key);

  const target = {
    root: deps.root,
    botId,
    isSandboxed: deps.executionEnv.spawn !== undefined,
  };

  // SAFETY: stored OAuth tokens are keyed by server URL, so a bot-local file naming a shared URL must not get them.
  const authProvider = await match(entry)
    .with({ isBotLocal: false, config: { url: P.string } }, ({ config: { url } }) => deps.auth.provider({ serverUrl: url }))
    .otherwise(() => undefined);

  return match(previous)
    .when((connection): connection is McpConnection => connection?.fingerprint === fingerprint && connection.authProvider === authProvider && !connection.error
      && ['connecting', 'connected', 'idle'].includes(connection.client.connectionState), async (connection) => {
      await connection.ready;

      return match(connection.hasToolChanges)
        .with(true, async () => {
          await mcpActionConnectTools(connection, entry.name);
          return connection.tools;
        })
        .with(false, () => connection.tools)
        .exhaustive();
    })
    .otherwise(async () => {
      const directory = join(deps.root, 'agents', botId);

      const client = new McpClient({
        name: 'bots',
        version: '1.0.0',
        requestTimeoutMs: match(entry.config)
          .with({ command: P.string }, () => MCP.commandRequestTimeoutMs)
          .otherwise(() => MCP.requestTimeoutMs),
        roots: [{ uri: pathToFileURL(directory).href, name: botId }],
      });

      const connection: McpConnection = {
        fingerprint,
        sourceFingerprint,
        client,
        authProvider,
        tools: [],
        definitions: [],
        catalog: [],
        ready: Promise.resolve(),
        hasToolChanges: false,
      };

      deps.connections.set(key, connection);
      client.onNotification('notifications/tools/list_changed', () => {
        connection.hasToolChanges = true;
      });

      connection.ready = (async () => {
        try {
          await previous?.client.close();
          await previous?.ready;

          const transport = await match(entry.config)
            // SAFETY: with a sandbox, a command server only ever starts there (fail closed, like the tools).
            .with({ command: P.string }, (config) => match(deps.executionEnv.spawn)
              .with(P.nonNullable, (spawn) => mcpTransportSandbox(spawn, {
                command: config.command,
                args: config.args ?? [],
                env: config.env ?? {},
                cwd: resolve(directory, config.cwd ?? '.'),
              }))
              .otherwise(() => new StdioTransport({
                command: config.command,
                args: config.args,
                env: config.env,
                cwd: resolve(directory, config.cwd ?? '.'),
              })))
            .otherwise(async (config) => new StreamableHttpTransport({
              url: config.url,
              headers: config.headers,
              authProvider,
            }));

          await client.connect(transport);
          await mcpActionConnectTools(connection, entry.name);
        } catch (error) {
          connection.needsLogin = error instanceof McpAuthRequiredError;

          connection.error = match(error)
            .with(P.instanceOf(McpAuthRequiredError), () => 'MCP server requires login.')
            .with(P.instanceOf(Errors.SANDBOX_UNAVAILABLE), () => m.ui_mcp_sandbox_unavailable())
            .with(P.instanceOf(Errors.NOT_FOUND), () => m.ui_mcp_sandbox_missing({ command: entry.config.command ?? '' }))
            .otherwise(() => 'Cannot connect to MCP server.');

          connection.definitions = previous?.fingerprint === fingerprint ? previous.definitions : [];
          connection.tools = mcpTools(connection, entry.name, connection.definitions, target);
          await client.close();
        }
      })();

      await connection.ready;

      return connection.tools;
    });

  async function mcpActionConnectTools(connection: McpConnection, server: string): Promise<void> {
    try {
      connection.hasToolChanges = false;
      const tools = await connection.client.listTools();
      const registrations = mcpTools(connection, server, tools, target);
      connection.definitions = tools;
      connection.tools = registrations;

      connection.catalog = tools.map((tool, index) => ({
        name: tool.name,
        runtimeName: registrations[index].name,
        title: tool.title ?? tool.name,
        description: tool.description ?? '',
      }));
    } catch {
      connection.tools = [];
      connection.catalog = [];
      connection.error = 'Cannot discover MCP tools.';
      await connection.client.close();
    }
  }
}
