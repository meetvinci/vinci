import type { Socket } from 'node:net';

export interface RuntimeSandboxParams {
  root: string;
  folder: string;
}

export interface RuntimeSandboxState {
  spares: Socket[];
  waiters: Set<() => void>;
  reserved: Socket | undefined;
  bridgePath: string;
  isClosing: boolean;
}
