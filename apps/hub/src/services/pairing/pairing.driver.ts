import { makeHttpClient } from '@repo/client/client';
import { PAIRING } from './pairing.constants';

export async function pairingDriverBootstrap(door: (request: Request) => Promise<Response>) {
  const socket = makeHttpClient(() => ({ url: `${PAIRING.socketOrigin}/rpc`, fetch: (request, init) => door(new Request(request, init)) }));

  return socket.pairing.bootstrap();
}
