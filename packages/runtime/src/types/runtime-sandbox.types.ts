import type { Socket } from 'node:net';

export interface RuntimeSandboxParams {
  root: string;
  folder: string;
  bridge: string;
}

export interface RuntimeSandboxBridgeBuffer {
  chunks: Buffer[];
  bytes: number;
  limit: number;
}

export interface RuntimeSandboxBridgeRead {
  handle: number;
  length: number;
}

export interface RuntimeSandboxBridgeRequest {
  op?: string;
  handle?: number;
  length?: number;
}

export interface RuntimeSandboxBridgeFrame {
  bytes: Buffer;
  type: number;
  id: number;
  payloadBytes: number;
}

export interface RuntimeSandboxBridgeState {
  socket: Socket;
  marker: Buffer;
  reads: Map<number, RuntimeSandboxBridgeRead>;
  fileBytes: Map<number, number>;
  toSandbox: RuntimeSandboxBridgeBuffer;
  fromSandbox: RuntimeSandboxBridgeBuffer;
  isSynced: boolean;
  allowance: number;
  allowanceAt: number;
}

export interface RuntimeSandboxCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
}

export interface RuntimeSandboxState {
  spares: Socket[];
  waiters: Set<() => void>;
  reserved: Socket | undefined;
  bridgePath: string;
  isClosing: boolean;
}
