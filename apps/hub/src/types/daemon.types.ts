import { z } from 'zod';
import type { User } from './user.types';

export const daemonPins = z.record(z.string(), z.uuid()).refine((pins) => new Set(Object.values(pins)).size === Object.keys(pins).length, { message: 'Each daemon server ID may be pinned to one user only' });

export type DaemonPins = z.infer<typeof daemonPins>;

export interface DaemonServiceParams {
  directory: string;
}

export interface DaemonServiceDeps {
  path: string;
  state: DaemonState;
}

export interface DaemonState {
  pins: DaemonPins;
  checked: Map<string, DaemonChecked>;
  saving: Promise<void>;
}

export interface DaemonTarget {
  url: string;
  serverId: string;
}

export interface DaemonChecked extends DaemonTarget {
  checkedAt: number;
}

export interface DaemonUserParams {
  user: User;
}

export interface DaemonService {
  actions: {
    resolve: (params: DaemonUserParams) => Promise<DaemonTarget>;
    forget: (params: DaemonUserParams) => void;
  };
}
