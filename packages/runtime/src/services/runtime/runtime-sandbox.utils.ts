import { Connection, RemoteExecutionEnv } from '@earendil-works/pi-env';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { RUNTIME_SANDBOX } from './runtime-sandbox.constants';
import type { RuntimeSandboxParams, RuntimeSandboxState } from '../../types/runtime-sandbox.types';
import type { Server, Socket } from 'node:net';

export function runtimeSandboxNative({ root, folder }: RuntimeSandboxParams) {
  const state: RuntimeSandboxState = {
    spares: [],
    waiters: new Set(),
    reserved: undefined,
    bridgePath: join(tmpdir(), `meetvinci-sandbox-${process.pid}.sock`),
    isClosing: false,
  };

  const sandboxes = createServer((socket) => runtimeSandboxAccept(state, socket));
  const bridges = createServer((child) => runtimeSandboxBridge(state, child));

  runtimeSandboxListen(sandboxes, join(folder, RUNTIME_SANDBOX.execSocket));
  runtimeSandboxListen(bridges, state.bridgePath);

  const connection = new Connection({
    command: async () => {
      state.reserved?.destroy();
      state.reserved = await runtimeSandboxTake(state, Date.now() + RUNTIME_SANDBOX.waitMs);

      return [process.execPath, '--no-install', '-e', RUNTIME_SANDBOX.bridge, state.bridgePath];
    },
    onLog: (text) => log.debug({ tag: 'sandbox', message: text.trim() }),
  });

  return {
    env: ({ cwd = '.' }: { cwd?: string }) => new RemoteExecutionEnv({
      connection,
      id: RUNTIME_SANDBOX.envId,
      cwd: resolve(root, cwd),
    }),
    close: () => {
      state.isClosing = true;
      connection.close();
      sandboxes.close();
      bridges.close();

      for (const socket of [...state.spares, state.reserved]) {
        socket?.destroy();
      }
    },
  };
}

export function runtimeSandboxRead(path: string, folders: string[]): string {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);

  try {
    // SAFETY: the opened file as the kernel names it (Linux), so a link a bot swaps in after any earlier check is caught.
    const opened = realpathSync(`/proc/self/fd/${descriptor}`);

    const isInside = folders.some((folder) => {
      const inner = relative(realpathSync(folder), opened);

      return inner !== '' && !isAbsolute(inner) && inner.split(sep)[0] !== '..';
    });

    if (!isInside || !fstatSync(descriptor).isFile()) {
      throw new Errors.FORBIDDEN({ internal: `${path} opens ${opened}, outside ${folders.join(', ')}` });
    }

    return readFileSync(descriptor, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

function runtimeSandboxListen(server: Server, path: string) {
  rmSync(path, { force: true });

  server.on('error', (error) => log.error({
    tag: 'sandbox',
    message: 'The sandbox socket failed: bot tools are off.',
    path,
    error,
  }));

  server.listen(path);
}

function runtimeSandboxAccept(state: RuntimeSandboxState, socket: Socket) {
  socket.on('error', () => socket.destroy());
  socket.once('close', () => state.spares.includes(socket) && state.spares.splice(state.spares.indexOf(socket), 1));
  state.spares.push(socket);

  for (const old of state.spares.splice(0, Math.max(0, state.spares.length - RUNTIME_SANDBOX.spares))) {
    old.destroy();
  }

  for (const wake of state.waiters) {
    wake();
  }
}

function runtimeSandboxBridge(state: RuntimeSandboxState, child: Socket) {
  const sandbox = state.reserved;
  state.reserved = undefined;

  if (!sandbox || sandbox.destroyed) {
    child.destroy();
    return;
  }

  const runtimeSandboxEnd = () => {
    child.destroy();
    sandbox.destroy();
  };

  for (const side of [child, sandbox]) {
    side.once('close', runtimeSandboxEnd);
    side.on('error', runtimeSandboxEnd);
  }

  sandbox.once('close', () => !state.isClosing && log.warn({ tag: 'sandbox', message: 'The sandbox connection closed; the next tool call connects again.' }));
  child.pipe(sandbox);
  sandbox.pipe(child);
}

async function runtimeSandboxTake(state: RuntimeSandboxState, deadline: number): Promise<Socket> {
  const spare = state.spares.pop();

  if (spare && !spare.destroyed) {
    return spare;
  }

  if (Date.now() >= deadline) {
    log.warn({ tag: 'sandbox', message: 'Refused a bot tool call: no sandbox is connected.' });
    throw new Errors.SANDBOX_UNAVAILABLE({ internal: 'No sandbox connected to exec.sock' });
  }

  await new Promise<void>((wake) => {
    const runtimeSandboxWake = () => {
      clearTimeout(timer);
      state.waiters.delete(runtimeSandboxWake);
      wake();
    };

    const timer = setTimeout(runtimeSandboxWake, deadline - Date.now());
    state.waiters.add(runtimeSandboxWake);
  });

  return runtimeSandboxTake(state, deadline);
}
