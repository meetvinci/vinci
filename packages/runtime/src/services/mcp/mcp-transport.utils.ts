import { isJsonRpcResponse, JSON_RPC_ERROR_CODES, McpConnectionClosedError, McpError, parseJsonRpcMessage } from '@earendil-works/pi-mcp';
import { match, P } from 'ts-pattern';
import { mcpMessageLines } from './mcp-message.utils';
import { MCP } from './mcp.constants';
import type { McpSandboxSpawn } from '../../types/mcp.types';
import type { RuntimeSandboxCommand } from '../../types/runtime-sandbox.types';
import type * as PiMcpTypes from '@earendil-works/pi-mcp';
import type { Socket } from 'node:net';

export function mcpTransportSandbox(spawn: McpSandboxSpawn, command: RuntimeSandboxCommand): PiMcpTypes.McpTransport {
  const messageListeners = new Set<PiMcpTypes.McpTransportMessageListener>();
  const errorListeners = new Set<PiMcpTypes.McpTransportErrorListener>();
  const closeListeners = new Set<PiMcpTypes.McpTransportCloseListener>();
  let socket: Socket | undefined;
  const calls = new Set<PiMcpTypes.JsonRpcId>();
  let isStarted = false;
  let isClosed = false;
  let isCloseEmitted = false;
  let pendingWrites = 0;
  let toolPages = 0;

  const mcpTransportError = (error: Error) => {
    for (const listener of errorListeners) {
      listener(error);
    }
  };

  const mcpTransportClosed = () => {
    if (isCloseEmitted) {
      return;
    }

    isCloseEmitted = true;

    for (const listener of closeListeners) {
      listener();
    }
  };

  const mcpTransportMessage = (message: PiMcpTypes.JsonRpcMessage) => {
    if (isJsonRpcResponse(message)) {
      calls.delete(message.id);
    }

    for (const listener of messageListeners) {
      listener(message);
    }
  };

  // SAFETY: a line over MCP.maxMessageBytes is never kept (mcpMessage), so a flood costs one message of memory.
  const lines = mcpMessageLines(calls, (read, bytes) => {
    if (read === undefined) {
      mcpTransportError(new McpError(JSON_RPC_ERROR_CODES.invalidRequest, `MCP message exceeds ${MCP.maxMessageBytes} bytes (${bytes})`));
      return;
    }

    if (!Buffer.isBuffer(read)) {
      mcpTransportMessage(read);
      return;
    }

    const text = read.toString('utf8').replace(/\r$/u, '');

    if (text.trim() === '') {
      return;
    }

    try {
      mcpTransportMessage(parseJsonRpcMessage(JSON.parse(text)));
    } catch (error) {
      mcpTransportError(error instanceof Error ? error : new McpError(JSON_RPC_ERROR_CODES.parseError, 'Invalid MCP message'));
    }
  });

  return {
    start: async () => {
      if (isStarted || isClosed) {
        throw new McpConnectionClosedError();
      }

      isStarted = true;
      const opened = await spawn(command);
      socket = opened;
      opened.on('data', lines.push);
      opened.on('error', (error) => !isClosed && mcpTransportError(error));
      opened.once('close', mcpTransportClosed);
      opened.resume();
    },
    send: async (message) => {
      const opened = socket;

      if (!opened || isClosed || !opened.writable) {
        throw new McpConnectionClosedError();
      }

      // SAFETY: a server that stops reading its stdin must not grow the daemon's write buffer, in bytes or in pending writes.
      if (opened.writableLength > MCP.maxMessageBytes || pendingWrites >= MCP.maxPendingWrites) {
        opened.destroy();
        throw new McpConnectionClosedError('The MCP server stopped reading its input.');
      }

      // SAFETY: pi-mcp 1.4.0 listTools follows up to 1,000 pages of 16 MiB with no budget and has no page API for tools.
      toolPages = match(message)
        .with({ method: 'tools/list', params: { cursor: P.string } }, () => toolPages + 1)
        .with({ method: 'tools/list' }, () => 1)
        .otherwise(() => toolPages);

      if (toolPages > MCP.maxToolPages) {
        opened.destroy();
        throw new McpError(JSON_RPC_ERROR_CODES.invalidRequest, `MCP tools/list exceeds ${MCP.maxToolPages} pages`);
      }

      match(message)
        .with({ method: 'tools/call', id: P.union(P.string, P.number) }, ({ id }) => calls.add(id))
        .with({ method: 'notifications/cancelled', params: { requestId: P.union(P.string, P.number) } }, ({ params }) => calls.delete(params.requestId))
        .otherwise(() => undefined);

      await new Promise<void>((resolve, reject) => {
        pendingWrites += 1;

        opened.write(`${JSON.stringify(message)}\n`, (error) => {
          pendingWrites -= 1;

          return error ? reject(error) : resolve();
        });
      });
    },
    close: async () => {
      if (isClosed) {
        return;
      }

      isClosed = true;
      const opened = socket;

      if (!opened || opened.destroyed) {
        mcpTransportClosed();
        return;
      }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => opened.destroy(), MCP.closeTimeoutMs);

        opened.once('close', () => {
          clearTimeout(timer);
          resolve();
        });

        opened.end();
      });
    },
    onMessage: (listener) => {
      messageListeners.add(listener);
      return () => void messageListeners.delete(listener);
    },
    onError: (listener) => {
      errorListeners.add(listener);
      return () => void errorListeners.delete(listener);
    },
    onClose: (listener) => {
      closeListeners.add(listener);
      return () => void closeListeners.delete(listener);
    },
  };
}
