import { connectionStored, SERVER_PROTOCOL } from '@repo/contracts/universal';
import { parse } from 'cookie-es';
import type * as CoreTypes from '../types/core.types';

const CONNECTION_COOKIE = 'bots.connection';

function corePairingConnection(request: Request) {
  return connectionStored.safeParse(parse(request.headers.get('cookie') ?? '')[CONNECTION_COOKIE]).data;
}

export async function corePairingConnect(services: CoreTypes.CoreServices, context: CoreTypes.CoreContext): Promise<Response | null> {
  const daemon = await services.daemons.actions.resolve({ user: context.user });

  return corePairingConnection(context.request)?.serverId === daemon.serverId ? null : corePairingRespond(services, context);
}

export function corePairingFileHeaders(request: Request): Record<string, string> {
  const connection = corePairingConnection(request);

  return connection
    ? {
      'authorization': `Bearer ${connection.token}`,
      [SERVER_PROTOCOL.versionHeader]: String(SERVER_PROTOCOL.version),
      [SERVER_PROTOCOL.serverIdHeader]: connection.serverId,
    }
    : {};
}

export async function corePairingRespond(services: CoreTypes.CoreServices, { user }: CoreTypes.CoreContext): Promise<Response> {
  const payload = await services.pairing.actions.grant({ user });

  return new Response(null, { status: 303, headers: { 'Location': `/connect?code=${encodeURIComponent(payload)}`, 'Cache-Control': 'no-store' } });
}
