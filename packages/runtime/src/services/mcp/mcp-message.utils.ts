import { OutputBuffer } from '@earendil-works/chord/output';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from '@earendil-works/pi-coding-agent';
import { JSON_RPC_ERROR_CODES, McpError, parseJsonRpcMessage } from '@earendil-works/pi-mcp';
import { match, P } from 'ts-pattern';
import { MCP } from './mcp.constants';
import type { McpMessage, McpMessageRead } from '../../types/mcp.types';
import type * as PiMcpTypes from '@earendil-works/pi-mcp';

const mcpMessageIdValue = String.raw`(-?\d+|"(?:[^"\\]|\\.){0,200}")`;
// SAFETY: only the response's own id counts, first in the object (`{"jsonrpc":"2.0","id":…`) or last (`…,"id":…}`).
const mcpMessageIdFirst = new RegExp(String.raw`^\s*(?:data:\s?)?\{\s*(?:"jsonrpc"\s*:\s*"2\.0"\s*,\s*)?"id"\s*:\s*${mcpMessageIdValue}`, 'u');
const mcpMessageIdLast = new RegExp(String.raw`"id"\s*:\s*${mcpMessageIdValue}\s*(?:,\s*"jsonrpc"\s*:\s*"2\.0"\s*)?\}\s*$`, 'u');
const mcpMessageIsError = /"isError"\s*:\s*true/u;
const mcpMessageEscapes = new Map([[0x22, 0x22], [0x5c, 0x5c], [0x2f, 0x2f], [0x62, 0x08], [0x66, 0x0c], [0x6e, 0x0a], [0x72, 0x0d], [0x74, 0x09]]);

// SAFETY: a message over MCP.maxMessageBytes is never kept; one answering a pending tools/call becomes that call's result, bounded.
export function mcpMessage(calls: ReadonlySet<PiMcpTypes.JsonRpcId>): McpMessage {
  let chunks: Buffer[] = [];
  let length = 0;
  let oversize: ReturnType<typeof mcpMessageOversize> | undefined;

  return {
    push: (chunk) => {
      length += chunk.length;

      if (oversize) {
        oversize.push(chunk);
      } else if (length <= MCP.maxMessageBytes) {
        chunks.push(Buffer.from(chunk));
      } else {
        oversize = mcpMessageOversize();

        for (const kept of chunks) {
          oversize.push(kept);
        }

        oversize.push(chunk);
        chunks = [];
      }
    },
    end: () => oversize?.end(calls) ?? Buffer.concat(chunks, length),
    bytes: () => length,
  };
}

export function mcpMessageLines(calls: ReadonlySet<PiMcpTypes.JsonRpcId>, onMessage: (message: McpMessageRead, bytes: number) => void) {
  let message = mcpMessage(calls);

  const mcpMessageLine = () => {
    onMessage(message.end(), message.bytes());
    message = mcpMessage(calls);
  };

  return {
    push: (chunk: Buffer) => {
      let rest = chunk;

      for (let newline = rest.indexOf(0x0a); newline >= 0; newline = rest.indexOf(0x0a)) {
        message.push(rest.subarray(0, newline));
        rest = rest.subarray(newline + 1);
        mcpMessageLine();
      }

      if (rest.length > 0) {
        message.push(rest);
      }
    },
    end: () => {
      if (message.bytes() > 0) {
        mcpMessageLine();
      }
    },
  };
}

// SAFETY: pi-mcp 1.4.0 reads a JSON answer whole (500 MB ended the daemon), so answers go through mcpMessage, events line by line.
export async function mcpMessageFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  const type = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  const answer = { status: response.status, statusText: response.statusText, headers };

  // SAFETY: pi-mcp reads a failed answer's body whole for its message, so only its head is passed on.
  if (!response.ok && response.body !== null) {
    return new Response(await mcpMessageHead(response.body), answer);
  }

  if (response.body === null || (type !== 'application/json' && type !== 'text/event-stream')) {
    return response;
  }

  const calls = mcpMessageCalls(init?.body);

  if (type === 'application/json') {
    const message = mcpMessage(calls);

    await response.body.pipeTo(new WritableStream<Uint8Array>({
      write: (chunk) => message.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)),
    }));

    const read = message.end();

    if (read === undefined) {
      throw new McpError(JSON_RPC_ERROR_CODES.invalidRequest, `MCP message exceeds ${MCP.maxMessageBytes} bytes (${message.bytes()})`);
    }

    return new Response(Buffer.isBuffer(read) ? read.toString('utf8') : JSON.stringify(read), answer);
  }

  let lines: ReturnType<typeof mcpMessageLines> | undefined;

  return new Response(response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    start: (controller) => {
      lines = mcpMessageLines(calls, (read) => match(read)
        .with(P.instanceOf(Buffer), (line) => controller.enqueue(Buffer.concat([line, Buffer.from('\n')])))
        .with(P.nonNullable, (message) => controller.enqueue(Buffer.from(`data: ${JSON.stringify(message)}\n`)))
        .otherwise(() => undefined));
    },
    transform: (chunk) => lines?.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)),
    flush: () => lines?.end(),
  })), answer);
}

async function mcpMessageHead(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();

  const mcpMessageHeadRead = async (kept: Buffer): Promise<Buffer> => {
    if (kept.length >= MCP.oversizeEdgeBytes) {
      return kept;
    }

    const read = await reader.read();
    return read.done ? kept : mcpMessageHeadRead(Buffer.concat([kept, read.value]));
  };

  try {
    return (await mcpMessageHeadRead(Buffer.alloc(0))).subarray(0, MCP.oversizeEdgeBytes).toString('utf8');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function mcpMessageCalls(body: RequestInit['body']): Set<PiMcpTypes.JsonRpcId> {
  return match(body)
    .with(P.string, (text) => {
      try {
        return match(parseJsonRpcMessage(JSON.parse(text)))
          .with({ method: 'tools/call', id: P.union(P.string, P.number) }, ({ id }) => new Set([id]))
          .otherwise(() => new Set<PiMcpTypes.JsonRpcId>());
      } catch {
        return new Set<PiMcpTypes.JsonRpcId>();
      }
    })
    .otherwise(() => new Set<PiMcpTypes.JsonRpcId>());
}

// SAFETY: costs one chunk and a few KiB whatever the message's size: its two edges for the id, and Pi's output window.
function mcpMessageOversize() {
  const output = new OutputBuffer({
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
    retain: 'head',
  });

  let head = Buffer.alloc(0);
  let tail = Buffer.alloc(0);
  let total = 0;
  let phase: 'key' | 'value' | 'done' = 'key';
  let isInString = false;
  let isEscaped = false;
  let isAfterColon = false;
  // SAFETY: only `result.content[i].text` counts, so a "text" key elsewhere (structuredContent, _meta) is never taken for the result.
  const keys: (string | undefined)[] = [];
  let name: string | undefined;
  let key: string | undefined;
  let escape = 0;
  let unit = 0;
  let high = 0;

  const mcpMessageKey = (byte: number): boolean => {
    if (isInString) {
      if (isEscaped || byte === 0x5c) {
        isEscaped = !isEscaped;
        name = undefined;
      } else if (byte === 0x22) {
        isInString = false;
        isAfterColon = false;
      } else {
        name = name !== undefined && name.length < 16 ? name + String.fromCharCode(byte) : undefined;
      }

      return false;
    }

    if (byte === 0x22 && isAfterColon && key === 'text' && keys.length === 4 && keys[1] === 'result' && keys[2] === 'content') {
      return true;
    }

    if (byte === 0x22) {
      isInString = true;
      name = '';
    } else if (byte === 0x3a) {
      key = name;
      isAfterColon = true;
    } else if (byte === 0x7b || byte === 0x5b) {
      keys.push(isAfterColon ? key : undefined);
      isAfterColon = false;
    } else if (byte === 0x7d || byte === 0x5d) {
      keys.pop();
      isAfterColon = false;
    } else if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      isAfterColon = false;
    }

    return false;
  };

  const mcpMessageValue = (chunk: Buffer, start: number): number => {
    // SAFETY: decoding never grows a chunk, except up to 7 bytes from an escape or surrogate begun in the last one.
    const out = Buffer.allocUnsafe(chunk.length - start + 8);
    let size = 0;

    const mcpMessageWrite = (point: number) => {
      size += out.write(String.fromCodePoint(point), size);
    };

    const mcpMessageFlushHigh = () => {
      if (high === 0) {
        return;
      }

      mcpMessageWrite(0xfffd);
      high = 0;
    };

    for (let index = start; index < chunk.length; index++) {
      const byte = chunk[index];

      if (escape === 0 && byte !== 0x5c && byte !== 0x22) {
        mcpMessageFlushHigh();
        let end = index;

        while (end < chunk.length && chunk[end] !== 0x5c && chunk[end] !== 0x22) {
          end++;
        }

        size += chunk.copy(out, size, index, end);
        index = end - 1;
      } else if (escape === 0 && byte === 0x22) {
        mcpMessageFlushHigh();
        output.push(out.subarray(0, size));

        return index;
      } else if (escape === 0) {
        escape = 1;
      } else if (escape === 1 && byte === 0x75) {
        escape = 2;
        unit = 0;
      } else if (escape === 1) {
        mcpMessageFlushHigh();
        out[size++] = mcpMessageEscapes.get(byte) ?? byte;
        escape = 0;
      } else {
        unit = unit * 16 + Number.parseInt(String.fromCharCode(byte), 16);
        escape = escape === 5 ? 0 : escape + 1;

        if (escape === 0 && unit >= 0xd800 && unit <= 0xdbff) {
          mcpMessageFlushHigh();
          high = unit;
        } else if (escape === 0 && unit >= 0xdc00 && unit <= 0xdfff && high !== 0) {
          mcpMessageWrite(0x10000 + ((high - 0xd800) << 10) + (unit - 0xdc00));
          high = 0;
        } else if (escape === 0) {
          mcpMessageFlushHigh();
          mcpMessageWrite(Number.isNaN(unit) || (unit >= 0xdc00 && unit <= 0xdfff) ? 0xfffd : unit);
        }
      }
    }

    output.push(out.subarray(0, size));

    return -1;
  };

  return {
    push: (chunk: Buffer) => {
      total += chunk.length;

      if (head.length < MCP.oversizeEdgeBytes) {
        head = Buffer.concat([head, chunk.subarray(0, MCP.oversizeEdgeBytes - head.length)]);
      }

      tail = chunk.length >= MCP.oversizeEdgeBytes
        ? Buffer.from(chunk.subarray(-MCP.oversizeEdgeBytes))
        : Buffer.concat([tail, chunk]).subarray(-MCP.oversizeEdgeBytes);

      for (let index = 0; index < chunk.length && phase !== 'done'; index++) {
        if (phase === 'key' && mcpMessageKey(chunk[index])) {
          phase = 'value';
        } else if (phase === 'value') {
          const end = mcpMessageValue(chunk, index);
          phase = end < 0 ? 'value' : 'done';
          index = end < 0 ? chunk.length : end;
        }
      }
    },
    end: (calls: ReadonlySet<PiMcpTypes.JsonRpcId>): PiMcpTypes.JsonRpcMessage | undefined => {
      const edges = [head.toString('utf8'), tail.toString('utf8')];
      const found = mcpMessageIdFirst.exec(edges[0]) ?? mcpMessageIdLast.exec(edges[1]);
      // SAFETY: the pattern matched an integer or a JSON string literal, so it parses to a number or a string.
      const id = found ? JSON.parse(found[1]) as PiMcpTypes.JsonRpcId : undefined;

      if (id === undefined || !calls.has(id)) {
        return undefined;
      }

      output.end();
      const { text, droppedLines } = output.snapshot();

      // SAFETY: everything but the kept text counts as dropped, so other items (images, more text) are never dropped unannounced.
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: phase === 'key' ? [] : [{ type: 'text', text }],
          isError: edges.some((edge) => mcpMessageIsError.test(edge)),
          _meta: { [MCP.truncatedMeta]: { droppedBytes: total - Buffer.byteLength(text), droppedLines } },
        },
      };
    },
  };
}
