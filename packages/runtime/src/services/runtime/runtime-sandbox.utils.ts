import { Connection, RemoteExecutionEnv } from '@earendil-works/pi-env';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { match } from 'ts-pattern';
import { RUNTIME_SANDBOX } from './runtime-sandbox.constants';
import type { RuntimeSandboxCommand, RuntimeSandboxParams, RuntimeSandboxState } from '../../types/runtime-sandbox.types';
import type { Server, Socket } from 'node:net';

export function runtimeSandboxNative({ root, folder, bridge }: RuntimeSandboxParams) {
  const state: RuntimeSandboxState = {
    spares: [],
    waiters: new Set(),
    reserved: undefined,
    bridgePath: join(tmpdir(), `vinci-sandbox-${process.pid}.sock`),
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

      return [process.execPath, '--no-install', bridge, state.bridgePath];
    },
    onLog: (text) => log.warn({ tag: 'sandbox', message: text.trim() }),
  });

  return {
    env: ({ cwd = '.' }: { cwd?: string }) => new RemoteExecutionEnv({
      connection,
      id: RUNTIME_SANDBOX.envId,
      cwd: resolve(root, cwd),
    }),
    spawn: async (command: RuntimeSandboxCommand) => runtimeSandboxRun(await runtimeSandboxTake(state, Date.now() + RUNTIME_SANDBOX.waitMs), command),
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

async function runtimeSandboxRun(socket: Socket, { command, args, env, cwd }: RuntimeSandboxCommand): Promise<Socket> {
  const fields = [cwd, ...Object.entries(env).map(([name, value]) => `${name}=${value}`), command, ...args]
    .map((value) => Buffer.from(`v${value}`).toString('base64'));

  socket.write(`run ${Object.keys(env).length} ${fields.join(' ')}\n`);

  const answer = await new Promise<string | undefined>((settle) => {
    let buffer = Buffer.alloc(0);

    const runtimeSandboxAnswer = (value: string | undefined) => {
      clearTimeout(timer);
      socket.off('data', runtimeSandboxData);
      socket.off('close', runtimeSandboxClosed);
      settle(value);
    };

    const runtimeSandboxData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const newline = buffer.indexOf(0x0a);

      if (newline >= 0) {
        socket.pause();
        socket.unshift(buffer.subarray(newline + 1));
        runtimeSandboxAnswer(buffer.subarray(0, newline).toString('utf8'));
      } else if (buffer.length > RUNTIME_SANDBOX.maxAnswerBytes) {
        runtimeSandboxAnswer(undefined);
      }
    };

    const runtimeSandboxClosed = () => runtimeSandboxAnswer(undefined);
    const timer = setTimeout(runtimeSandboxClosed, RUNTIME_SANDBOX.waitMs);
    socket.on('data', runtimeSandboxData);
    socket.once('close', runtimeSandboxClosed);
  });

  return match(answer)
    .with(RUNTIME_SANDBOX.started, () => socket)
    .with(RUNTIME_SANDBOX.missing, () => {
      socket.destroy();
      throw new Errors.NOT_FOUND({ resource: 'command', resourceId: command });
    })
    .otherwise(() => {
      socket.destroy();
      log.warn({
        tag: 'sandbox',
        message: 'The sandbox did not start an MCP server: is its image older than the daemon?',
        command,
      });
      throw new Errors.SANDBOX_UNAVAILABLE({ internal: `The sandbox answered ${JSON.stringify(answer)} to a run line` });
    });
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
