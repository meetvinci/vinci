import { generateCACertificate, getLocal } from 'mockttp';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect, createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { secretProxyActionSwap } from './secret-proxy-action.swap';
import { SECRET_PROXY } from './secret-proxy.constants';
import { secretProxyDriverForward } from './secret-proxy.driver';
import { secretProxyIsLocal } from './secret-proxy.utils';
import type { SecretProxyServiceDeps } from '../../types/secret-proxy.types';
import type { CompletedRequest } from 'mockttp';
import type { AddressInfo } from 'node:net';

const refused = { response: { statusCode: 403, body: 'Proxy authorization required.\n' } };

export function secretProxyActionStart(deps: SecretProxyServiceDeps) {
  async function secretProxyStart() {
    deps.state.token = randomBytes(32).toString('hex');
    deps.state.forwardKey = randomBytes(32).toString('hex');

    const secretProxyAuthorized = (request: CompletedRequest) => secretProxyIsLocal(request.remoteIpAddress)
      && request.tags.includes(`socket-metadata:${deps.state.token}`);

    const forward = createServer((request, response) => {
      secretProxyDriverForward(deps, { request, response }).catch(() => response.destroy());
    });

    forward.listen(0, '127.0.0.1');
    await once(forward, 'listening');
    deps.state.forward = forward;
    // SAFETY: a server listening on a TCP host and port reports an AddressInfo, never a pipe path.
    deps.state.forwardUrl = `http://127.0.0.1:${String((forward.address() as AddressInfo).port)}/`;

    const ca = await generateCACertificate();

    const server = getLocal({
      https: ca,
      recordTraffic: false,
      maxBodySize: SECRET_PROXY.bufferedBodyMaxBytes,
    });

    const bundle = [ca.cert, ...rootCertificates].join('\n');

    await mkdir(deps.folder, { recursive: true, mode: 0o700 });
    await writeFile(join(deps.folder, SECRET_PROXY.bundleFile), bundle, { mode: 0o644 });

    await server.forAnyRequest().always().thenPassThrough({
      beforeRequest: (request) => (secretProxyAuthorized(request) ? secretProxyActionSwap(deps, { request }) : refused),
    });

    await server.on('response', () => undefined);
    await server.start();

    deps.state.server = server;

    if (deps.sandboxDir) {
      await writeFile(join(deps.sandboxDir, SECRET_PROXY.bundleFile), bundle, { mode: 0o644 });
      deps.state.bridge = await secretProxyBridge(join(deps.sandboxDir, SECRET_PROXY.sandboxSocket), server.port);
    }
  }

  async function secretProxyBridge(path: string, port: number) {
    await rm(path, { force: true });

    const bridge = createNetServer((client) => {
      const upstream = connect(port, '127.0.0.1');
      client.pipe(upstream).pipe(client);
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
    });

    await new Promise<void>((done, failed) => {
      bridge.once('error', failed);
      bridge.listen(path, () => done());
    });

    return bridge;
  }

  deps.state.starting ??= secretProxyStart().catch((error: unknown) => {
    deps.state.forward?.close();
    deps.state.forward = null;
    deps.state.starting = null;
    throw error;
  });

  return deps.state.starting;
}
