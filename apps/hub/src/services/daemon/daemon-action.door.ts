import { SERVER_PROTOCOL } from '@repo/contracts/universal';
import { daemonActionResolve } from './daemon-action.resolve';
import { DAEMON } from './daemon.constants';
import { daemonDriverSocket } from './daemon.driver';
import type * as DaemonTypes from '../../types/daemon.types';

export async function daemonActionDoor(deps: DaemonTypes.DaemonServiceDeps, { user, request }: DaemonTypes.DaemonDoorParams): Promise<Response> {
  const { serverId } = await daemonActionResolve(deps, { user });
  const { pathname, search } = new URL(request.url);
  const headers = new Headers(request.headers);

  headers.set(SERVER_PROTOCOL.serverIdHeader, serverId);

  return daemonDriverSocket(user.socketPath, new Request(new URL(`${pathname}${search}`, DAEMON.socketOrigin), {
    method: request.method,
    headers,
    body: request.body,
    signal: request.signal,
  }));
}
