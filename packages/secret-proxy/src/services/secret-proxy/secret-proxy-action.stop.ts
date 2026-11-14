import type { SecretProxyServiceDeps } from '../../types/secret-proxy.types';

export function secretProxyActionStop({ state }: SecretProxyServiceDeps) {
  state.bridge?.close();
  state.bridge = null;

  for (const server of [state.server, state.tunnels]) {
    server?.closeAllConnections();
    server?.close();
  }

  state.server = null;
  state.tunnels = null;
  state.starting = null;
}
