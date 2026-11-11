import { makeHttpClient } from '@repo/client/client';
import { Errors } from '@repo/errors/universal';
import { lstat, realpath } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PAIRING } from './pairing.constants';

export async function pairingDriverBootstrap(socketPath: string) {
  const entry = await lstat(socketPath).catch(() => null);
  const folder = await realpath(dirname(socketPath)).catch(() => null);

  if (!entry?.isSocket() || folder !== dirname(socketPath)) {
    throw new Errors.SERVER_UNREACHABLE({ internal: `Owner socket ${socketPath} is not a socket at its configured real path` });
  }

  const socket = makeHttpClient(() => ({ url: `${PAIRING.socketOrigin}/rpc`, fetch: (request, init) => fetch(request, { ...init, unix: socketPath }) }));

  return socket.pairing.bootstrap();
}
