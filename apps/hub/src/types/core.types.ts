import type { AccessService } from '../services/access/access.service';
import type { PairingService } from '../services/pairing/pairing.service';
import type { ProvisionerService } from '../services/provisioner/provisioner.service';
import type { AccessIdentity } from './access.types';
import type { AdminService } from './admin.types';
import type { DaemonService } from './daemon.types';
import type { GlobalService } from './global.types';
import type { User, UserService } from './user.types';
import type { ConversationTarget } from '@repo/contracts/universal';

export interface CoreServices {
  access: AccessService;
  users: UserService;
  daemons: DaemonService;
  global: GlobalService;
  pairing: PairingService;
  admins: AdminService;
  provisioner: ProvisionerService;
}

export interface CoreIncoming {
  request: Request;
  publicUrl: URL;
}

export interface CoreForward extends CoreIncoming {
  url: URL;
}

export interface CoreAdminContext extends CoreForward {
  identity: AccessIdentity;
}

export interface CoreRefusal {
  email: string;
  reason: 'no-user' | 'not-admin';
}

export interface CoreAdminRelay {
  id: string;
  procedure: string;
}

export interface CoreAdminAvatar {
  id: string;
  file: string;
}

export interface CoreAdminFile {
  id: string;
  botId: string;
  attachmentId: string;
  isPoster: boolean;
}

export interface CoreAdminRead {
  body: string;
  isAudited: boolean;
  target: ConversationTarget | null;
}

export interface CoreAdminAudit {
  by: string;
  user: string;
  procedure: string;
  status: number;
  target: ConversationTarget | null;
}

export interface CoreContext extends CoreAdminContext {
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
