import { pairingActionGrant } from './pairing-action.grant';
import type * as PairingTypes from '../../types/pairing.types';

export function makePairingService(params: PairingTypes.PairingServiceParams) {
  const deps: PairingTypes.PairingServiceDeps = { ...params, state: { attempts: new Map() } };

  return {
    actions: {
      grant: (input: PairingTypes.PairingGrantParams) => pairingActionGrant(deps, input),
    },
  };
}

export type PairingService = ReturnType<typeof makePairingService>;
