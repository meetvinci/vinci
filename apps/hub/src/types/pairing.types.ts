import type { DaemonService } from './daemon.types';
import type { User } from './user.types';

export interface PairingServiceParams {
  daemons: DaemonService;
}

export interface PairingServiceDeps extends PairingServiceParams {
  state: PairingState;
}

export interface PairingState {
  attempts: Map<string, number[]>;
}

export interface PairingGrantParams {
  user: User;
}
