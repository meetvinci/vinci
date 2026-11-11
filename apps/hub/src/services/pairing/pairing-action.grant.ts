import { authPairEntry } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { PAIRING } from './pairing.constants';
import { pairingDriverBootstrap } from './pairing.driver';
import type * as PairingTypes from '../../types/pairing.types';

export async function pairingActionGrant(deps: PairingTypes.PairingServiceDeps, { user }: PairingTypes.PairingGrantParams): Promise<string> {
  const now = Date.now();
  const recent = (deps.state.attempts.get(user.id) ?? []).filter((at) => now - at < PAIRING.windowMs);

  if (recent.length >= PAIRING.maxGrants) {
    throw new Errors.RATE_LIMITED({
      retryAfter: Math.ceil((recent[0] + PAIRING.windowMs - now) / 1000),
      internal: `Pairing limit reached for ${user.id}`,
    });
  }

  deps.state.attempts.set(user.id, [...recent, now]);

  const target = await deps.daemons.actions.resolve({ user });
  const grant = await pairingDriverBootstrap(user.socketPath);

  if (authPairEntry.parse(grant.qr.payload).target?.serverId !== target.serverId) {
    throw new Errors.SERVER_MISMATCH({ internal: `The owner socket of ${user.id} belongs to another daemon` });
  }

  log.info({
    tag: 'hub',
    message: 'Pairing grant issued through the hub',
    user: user.id,
  });

  return grant.qr.payload;
}
