import { connect } from 'node:net';
import { RUNTIME_SANDBOX } from './runtime-sandbox.constants';
import type * as RuntimeSandboxTypes from '../../types/runtime-sandbox.types';

export function runtimeSandboxBridgeRun([bridgePath = '', ...args]: string[]) {
  const state: RuntimeSandboxTypes.RuntimeSandboxBridgeState = {
    socket: connect(bridgePath, () => {
      state.socket.write(`${args.join(' ')}\n`);
      process.stdin.on('data', (chunk: Buffer) => runtimeSandboxBridgeFromDaemon(state, chunk));
      process.stdin.on('end', () => state.socket.end());
    }),
    marker: Buffer.from(`PI-ENV ${args.at(-1) ?? ''}\n`, 'utf8'),
    reads: new Map(),
    opens: new Map(),
    handles: new Map(),
    fileBytes: new Map(),
    toSandbox: { chunks: [], bytes: 0, limit: Number.MAX_SAFE_INTEGER },
    fromSandbox: { chunks: [], bytes: 0, limit: RUNTIME_SANDBOX.link.frameBytes },
    isSynced: false,
    allowance: RUNTIME_SANDBOX.link.frameBytes,
    allowanceAt: Date.now(),
  };

  state.socket.on('data', (chunk: Buffer) => runtimeSandboxBridgeFromSandbox(state, chunk));
  state.socket.on('close', () => process.exit(0));
  state.socket.on('error', (error) => runtimeSandboxBridgeEnd(state, error.message));
  process.stdout.on('drain', () => state.socket.resume());
}

function runtimeSandboxBridgeEnd(state: RuntimeSandboxTypes.RuntimeSandboxBridgeState, reason: string): never {
  process.stderr.write(`sandbox bridge: ${reason}\n`);
  state.socket.destroy();
  process.exit(1);
}

function runtimeSandboxBridgePeek(buffer: RuntimeSandboxTypes.RuntimeSandboxBridgeBuffer, length: number): Buffer {
  if ((buffer.chunks[0]?.length ?? 0) < length) {
    buffer.chunks = [Buffer.concat(buffer.chunks, buffer.bytes)];
  }

  return (buffer.chunks[0] ?? Buffer.alloc(0)).subarray(0, length);
}

function runtimeSandboxBridgeTake(buffer: RuntimeSandboxTypes.RuntimeSandboxBridgeBuffer, length: number): Buffer {
  const all = runtimeSandboxBridgePeek(buffer, buffer.bytes);
  const rest = all.subarray(length);

  buffer.chunks = rest.length > 0 ? [rest] : [];
  buffer.bytes = rest.length;

  return all.subarray(0, length);
}

function runtimeSandboxBridgeFrames(state: RuntimeSandboxTypes.RuntimeSandboxBridgeState, buffer: RuntimeSandboxTypes.RuntimeSandboxBridgeBuffer) {
  const frames: RuntimeSandboxTypes.RuntimeSandboxBridgeFrame[] = [];

  while (buffer.bytes >= RUNTIME_SANDBOX.link.headerBytes) {
    const header = runtimeSandboxBridgePeek(buffer, RUNTIME_SANDBOX.link.headerBytes);
    const length = header.readUInt32BE(0);
    const jsonBytes = header.readUInt32BE(9);

    if (length < RUNTIME_SANDBOX.link.frameBaseBytes + jsonBytes || length > buffer.limit) {
      runtimeSandboxBridgeEnd(state, `refused a frame of ${length} bytes with ${jsonBytes} bytes of JSON from the sandbox (at most ${buffer.limit})`);
    }

    if (buffer.bytes < length + 4) {
      break;
    }

    frames.push({
      bytes: runtimeSandboxBridgeTake(buffer, length + 4),
      type: header.readUInt8(4),
      id: header.readUInt32BE(5),
      payloadBytes: length - RUNTIME_SANDBOX.link.frameBaseBytes - jsonBytes,
    });
  }

  return frames;
}

function runtimeSandboxBridgeRequest({ bytes }: RuntimeSandboxTypes.RuntimeSandboxBridgeFrame): RuntimeSandboxTypes.RuntimeSandboxBridgeRequest {
  const json = bytes.subarray(RUNTIME_SANDBOX.link.headerBytes, RUNTIME_SANDBOX.link.headerBytes + bytes.readUInt32BE(9));

  // SAFETY: the daemon's own request, which pi-env's client builds from a JSON object it controls.
  return JSON.parse(json.toString('utf8')) as RuntimeSandboxTypes.RuntimeSandboxBridgeRequest;
}

function runtimeSandboxBridgeFromDaemon(state: RuntimeSandboxTypes.RuntimeSandboxBridgeState, chunk: Buffer) {
  state.socket.write(chunk);
  state.toSandbox.chunks.push(chunk);
  state.toSandbox.bytes += chunk.length;

  for (const frame of runtimeSandboxBridgeFrames(state, state.toSandbox)) {
    const { op, handle, length, mode } = frame.type === RUNTIME_SANDBOX.link.request ? runtimeSandboxBridgeRequest(frame) : {};

    if (op === 'open') {
      state.opens.set(frame.id, mode === undefined);
    }

    if (op === 'pread' && handle !== undefined && length !== undefined) {
      state.reads.set(frame.id, { handle, length });
    }

    if (op === 'close' && handle !== undefined) {
      state.fileBytes.delete(handle);
      state.handles.delete(handle);
    }
  }
}

function runtimeSandboxBridgeHandle({ bytes }: RuntimeSandboxTypes.RuntimeSandboxBridgeFrame): number | undefined {
  const json = bytes.subarray(RUNTIME_SANDBOX.link.headerBytes, RUNTIME_SANDBOX.link.headerBytes + bytes.readUInt32BE(9));

  try {
    // SAFETY: the sandbox's answer, which it controls: only a safe-integer `handle` is used, and one already open ends the bridge, so the cap comes from the daemon's request.
    const { handle } = JSON.parse(json.toString('utf8')) as { handle?: number };

    return Number.isSafeInteger(handle) ? handle : undefined;
  } catch {
    return undefined;
  }
}

function runtimeSandboxBridgeChecked(state: RuntimeSandboxTypes.RuntimeSandboxBridgeState, frame: RuntimeSandboxTypes.RuntimeSandboxBridgeFrame): Buffer {
  const isReader = state.opens.get(frame.id);

  if (isReader !== undefined && (frame.type === RUNTIME_SANDBOX.link.result || frame.type === RUNTIME_SANDBOX.link.error)) {
    const handle = frame.type === RUNTIME_SANDBOX.link.result ? runtimeSandboxBridgeHandle(frame) : undefined;

    state.opens.delete(frame.id);

    if (handle !== undefined && state.handles.has(handle)) {
      runtimeSandboxBridgeEnd(state, `refused handle ${handle} from the sandbox: it is already open`);
    }

    if (handle !== undefined) {
      state.handles.set(handle, isReader);
    }

    return frame.bytes;
  }

  const read = state.reads.get(frame.id);

  if (!read || (frame.type !== RUNTIME_SANDBOX.link.result && frame.type !== RUNTIME_SANDBOX.link.error)) {
    return frame.bytes;
  }

  state.reads.delete(frame.id);

  if (frame.payloadBytes > read.length) {
    runtimeSandboxBridgeEnd(state, `refused a read of ${frame.payloadBytes} bytes from the sandbox (asked for ${read.length})`);
  }

  const total = (state.fileBytes.get(read.handle) ?? 0) + frame.payloadBytes;

  state.fileBytes.set(read.handle, total);

  if (state.handles.get(read.handle) === true) {
    return total > RUNTIME_SANDBOX.link.readerBytes ? runtimeSandboxBridgeError(frame.id, RUNTIME_SANDBOX.link.readerTooBig) : frame.bytes;
  }

  return total > RUNTIME_SANDBOX.link.fileBytes ? runtimeSandboxBridgeError(frame.id, RUNTIME_SANDBOX.link.tooBig) : frame.bytes;
}

function runtimeSandboxBridgeError(id: number, message: string): Buffer {
  const body = Buffer.from(JSON.stringify({ code: 'EFBIG', message }), 'utf8');
  const header = Buffer.alloc(RUNTIME_SANDBOX.link.headerBytes);

  header.writeUInt32BE(RUNTIME_SANDBOX.link.frameBaseBytes + body.length, 0);
  header.writeUInt8(RUNTIME_SANDBOX.link.error, 4);
  header.writeUInt32BE(id, 5);
  header.writeUInt32BE(body.length, 9);

  return Buffer.concat([header, body]);
}

function runtimeSandboxBridgeSynced(state: RuntimeSandboxTypes.RuntimeSandboxBridgeState): boolean {
  const index = runtimeSandboxBridgePeek(state.fromSandbox, state.fromSandbox.bytes).indexOf(state.marker);

  if (index === -1 && state.fromSandbox.bytes > RUNTIME_SANDBOX.link.noiseBytes) {
    runtimeSandboxBridgeEnd(state, `refused ${state.fromSandbox.bytes} bytes from the sandbox before pi-env started`);
  }

  if (index === -1) {
    return false;
  }

  runtimeSandboxBridgeTake(state.fromSandbox, index + state.marker.length);
  process.stdout.write(state.marker);

  return true;
}

function runtimeSandboxBridgeFromSandbox(state: RuntimeSandboxTypes.RuntimeSandboxBridgeState, chunk: Buffer) {
  state.fromSandbox.chunks.push(chunk);
  state.fromSandbox.bytes += chunk.length;
  state.isSynced ||= runtimeSandboxBridgeSynced(state);

  const out = state.isSynced ? runtimeSandboxBridgeFrames(state, state.fromSandbox).map((frame) => runtimeSandboxBridgeChecked(state, frame)) : [];

  if (out.length > 0 && !process.stdout.write(Buffer.concat(out))) {
    state.socket.pause();
  }

  runtimeSandboxBridgePace(state, chunk.length);
}

function runtimeSandboxBridgePace(state: RuntimeSandboxTypes.RuntimeSandboxBridgeState, bytes: number) {
  const now = Date.now();

  const refill = ((now - state.allowanceAt) * RUNTIME_SANDBOX.link.bytesPerSecond) / 1000;

  state.allowance = Math.min(RUNTIME_SANDBOX.link.frameBytes, state.allowance + refill) - bytes;
  state.allowanceAt = now;

  if (state.allowance < 0) {
    state.socket.pause();
    setTimeout(() => process.stdout.writableNeedDrain || state.socket.resume(), Math.ceil((-state.allowance * 1000) / RUNTIME_SANDBOX.link.bytesPerSecond));
  }
}
