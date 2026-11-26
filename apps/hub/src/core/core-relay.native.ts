import { isAppError } from '@repo/errors/universal';
import { match, P } from 'ts-pattern';
import type * as CoreTypes from '../types/core.types';
import type { ServerWebSocket, WebSocketHandler, WebSocketOptions } from 'bun';

const RELAY = {
  maxPayloadBytes: 1024 * 1024,
  backpressureBytes: 4 * 1024 * 1024,
  pendingBytes: 1024 * 1024,
  idleTimeoutSeconds: 60,
  recheckMs: 5000,
};

export function makeCoreRelay(services: CoreTypes.CoreServices): WebSocketHandler<CoreTypes.CoreSocket> {
  return {
    maxPayloadLength: RELAY.maxPayloadBytes,
    backpressureLimit: RELAY.backpressureBytes,
    closeOnBackpressureLimit: true,
    idleTimeout: RELAY.idleTimeoutSeconds,
    sendPings: true,
    open(socket) {
      const options: WebSocketOptions = { headers: socket.data.origin ? { origin: socket.data.origin } : {} };
      const upstream: WebSocket = Reflect.construct(WebSocket, [socket.data.target, options]);

      upstream.binaryType = 'arraybuffer';
      upstream.addEventListener('open', () => {
        for (const message of socket.data.pending.splice(0)) {
          upstream.send(message);
        }

        socket.data.pendingBytes = 0;
      });
      upstream.addEventListener('message', (event) => socket.send(event.data));
      upstream.addEventListener('close', () => socket.close());
      socket.data.upstream = upstream;
      socket.data.checker = setInterval(() => void coreRelayRecheck(services, socket), RELAY.recheckMs);
    },
    message(socket, message) {
      const { payload, size } = match(message)
        .with(P.string, (text) => ({ payload: text, size: Buffer.byteLength(text) }))
        .otherwise((bytes) => ({ payload: Uint8Array.from(bytes), size: bytes.byteLength }));

      match(socket.data.upstream?.readyState)
        .with(WebSocket.OPEN, () => coreRelaySend(socket, payload, size))
        .with(WebSocket.CONNECTING, () => coreRelayQueue(socket, payload, size))
        .otherwise(() => socket.close());
    },
    close(socket) {
      clearInterval(socket.data.checker ?? undefined);
      socket.data.upstream?.close();
    },
  };
}

async function coreRelayRecheck(services: CoreTypes.CoreServices, socket: ServerWebSocket<CoreTypes.CoreSocket>): Promise<void> {
  const { identity } = socket.data;

  const isLoggedIn = identity.kind === 'access' || await services.accounts.queries.session({ token: identity.token })
    .then(({ email }) => email === identity.email)
    .catch((error: unknown) => !(isAppError(error) && error.code === 'UNAUTHORIZED'));

  const user = await services.users.queries.find({ email: identity.email });

  if (!isLoggedIn || Date.now() >= identity.expiresAt || user?.id !== socket.data.userId) {
    socket.close(1008);
  }
}

function coreRelaySend(socket: ServerWebSocket<CoreTypes.CoreSocket>, message: CoreTypes.CoreSocketMessage, size: number): void {
  const { upstream } = socket.data;

  if (!upstream || upstream.bufferedAmount + size > RELAY.backpressureBytes) {
    socket.close(1013);
    return;
  }

  upstream.send(message);
}

function coreRelayQueue(socket: ServerWebSocket<CoreTypes.CoreSocket>, message: CoreTypes.CoreSocketMessage, size: number): void {
  if (socket.data.pendingBytes + size > RELAY.pendingBytes) {
    socket.close(1013);
    return;
  }

  socket.data.pending.push(message);
  socket.data.pendingBytes += size;
}
