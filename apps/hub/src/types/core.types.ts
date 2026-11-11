import type { AccessService } from '../services/access/access.service';
import type { PairingService } from '../services/pairing/pairing.service';
import type { AccessIdentity } from './access.types';
import type { DaemonService } from './daemon.types';
import type { User, UserService } from './user.types';

export interface CoreServices {
  access: AccessService;
  users: UserService;
  daemons: DaemonService;
  pairing: PairingService;
}

export interface CoreIncoming {
  request: Request;
  publicUrl: URL;
}

export interface CoreForward extends CoreIncoming {
  url: URL;
}

export interface CoreContext extends CoreForward {
  identity: AccessIdentity;
  user: User;
}

export interface CoreSocket {
  email: string;
  userId: string;
  expiresAt: number;
  checker: Timer | null;
  target: string;
  origin: string | null;
  pending: CoreSocketMessage[];
  pendingBytes: number;
  upstream: WebSocket | null;
}

export type CoreSocketMessage = string | Uint8Array<ArrayBuffer>;
