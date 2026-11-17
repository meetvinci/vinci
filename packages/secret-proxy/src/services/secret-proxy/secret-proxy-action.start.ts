import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect, createServer as createNetServer, Socket } from 'node:net';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { secretProxyActionSwap } from './secret-proxy-action.swap';
import { secretProxyCertAuthority, secretProxyCertContext } from './secret-proxy-cert.utils';
import { SECRET_PROXY } from './secret-proxy.constants';
import { secretProxyDriverForward, secretProxyDriverRefuse, secretProxyDriverRefuseSocket, secretProxyDriverTunnel } from './secret-proxy.driver';
import { secretProxyIsAuthorized } from './secret-proxy.utils';
import type { SecretProxyExchange, SecretProxyServiceDeps, SecretProxyTunnel } from '../../types/secret-proxy.types';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';

const challenge = { 'proxy-authenticate': 'Basic realm="Vinci"' };

export function secretProxyActionStart(deps: SecretProxyServiceDeps) {
  async function secretProxyStartExchange({ request, response }: SecretProxyExchange, target: URL | null, pace: Duplex | null) {
    if (!target) {
      secretProxyDriverRefuse(response, 400, 'The proxy takes absolute http:// URLs, and HTTPS through CONNECT.');

      return;
    }

    const swapped = await secretProxyActionSwap(deps, { request, target });

    if (swapped.refusal !== null) {
      secretProxyDriverRefuse(response, 403, swapped.refusal);

      return;
    }

    await secretProxyDriverForward(deps, {
      request,
      response,
      target: swapped.target,
      headers: swapped.headers,
      pace,
    });
  }

  async function secretProxyStart() {
    const token = randomBytes(32).toString('hex');
    const authority = await secretProxyCertAuthority();
    const tunnelled = new WeakMap<object, SecretProxyTunnel>();

    const secretProxyServe = (exchange: SecretProxyExchange, target: URL | null, pace: Duplex | null) => {
      secretProxyStartExchange(exchange, target, pace).catch(() => exchange.response.destroy());
    };

    const tunnels = createServer({ requestTimeout: 0 }, (request, response) => {
      const tunnel = tunnelled.get(request.socket);
      const target = tunnel && request.url?.startsWith('/') ? URL.parse(`${tunnel.origin}${request.url}`) : null;

      secretProxyServe({ request, response }, target?.origin === tunnel?.origin ? target : null, tunnel?.socket ?? null);
    });

    const server = createServer({ requestTimeout: 0 }, (request, response) => {
      if (!secretProxyIsAuthorized(token, request.headers)) {
        secretProxyDriverRefuse(response, 407, 'Proxy authorization required.', challenge);

        return;
      }

      const target = URL.parse(request.url ?? '');

      secretProxyServe({ request, response }, target?.protocol === 'http:' ? target : null, null);
    });

    server.on('connect', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      socket.on('error', () => socket.destroy());

      if (socket instanceof Socket) {
        socket.setTimeout(SECRET_PROXY.idleTimeoutMs, () => socket.destroy());
      }

      const target = SECRET_PROXY.connectTarget.test(request.url ?? '') ? URL.parse(`https://${request.url ?? ''}`) : null;

      if (!secretProxyIsAuthorized(token, request.headers)) {
        secretProxyDriverRefuseSocket(socket, '407 Proxy Authentication Required', 'Proxy authorization required.', `proxy-authenticate: ${challenge['proxy-authenticate']}\r\n`);

        return;
      }

      if (!target) {
        secretProxyDriverRefuseSocket(socket, '400 Bad Request', 'The proxy cannot open a tunnel to that address.');

        return;
      }

      secretProxyCertContext(authority, target.hostname.replace(/^\[(.*)\]$/u, '$1')).then((secureContext) => {
        const tlsSocket = secretProxyDriverTunnel({
          socket,
          head,
          secureContext,
        });

        tunnelled.set(tlsSocket, { origin: target.origin, socket });
        tunnels.emit('connection', tlsSocket);
      }).catch(() => socket.destroy());
    });

    for (const listener of [server, tunnels]) {
      listener.setTimeout(SECRET_PROXY.idleTimeoutMs);
      listener.on('clientError', (_error, socket: Duplex) => socket.destroy());
    }

    const bundle = [authority.caCert.toString('pem'), ...rootCertificates].join('\n');

    await mkdir(deps.folder, { recursive: true, mode: 0o700 });
    await secretProxyTrustFiles(deps.folder, bundle);

    server.listen(0, SECRET_PROXY.host);
    await once(server, 'listening');

    // SAFETY: a server listening on a TCP host and port reports an AddressInfo, never a pipe path.
    deps.state.port = (server.address() as AddressInfo).port;
    deps.state.token = token;
    deps.state.server = server;
    deps.state.tunnels = tunnels;

    if (deps.sandboxDir) {
      await secretProxyTrustFiles(deps.sandboxDir, bundle);
      deps.state.bridge = await secretProxyBridge(join(deps.sandboxDir, SECRET_PROXY.sandboxSocket), deps.state.port);
    }
  }

  async function secretProxyTrustFiles(folder: string, bundle: string) {
    await writeFile(join(folder, SECRET_PROXY.bundleFile), bundle, { mode: 0o644 });
    await writeFile(join(folder, SECRET_PROXY.wgetrcFile), `ca_certificate = ${join(folder, SECRET_PROXY.bundleFile)}\n`, { mode: 0o644 });
  }

  async function secretProxyBridge(path: string, port: number) {
    await rm(path, { force: true });

    const bridge = createNetServer((client) => {
      const upstream = connect(port, '127.0.0.1');
      client.pipe(upstream).pipe(client);
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.once('close', () => upstream.destroy());
      upstream.once('close', () => client.destroy());
    });

    await new Promise<void>((done, failed) => {
      bridge.once('error', failed);
      bridge.listen(path, () => done());
    });

    return bridge;
  }

  deps.state.starting ??= secretProxyStart().catch((error: unknown) => {
    deps.state.starting = null;
    throw error;
  });

  return deps.state.starting;
}
