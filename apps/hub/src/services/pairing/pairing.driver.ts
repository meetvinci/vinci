import { makeHttpClient } from '@repo/client/client';
import { PAIRING } from './pairing.constants';

export function pairingDriverSocket(door: (request: Request) => Promise<Response>) {
  return makeHttpClient(() => ({ url: `${PAIRING.socketOrigin}/rpc`, fetch: (request, init) => door(new Request(request, init)) }));
}
