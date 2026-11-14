import type { SecretProxyServiceDeps } from '../../types/secret-proxy.types';

export async function secretProxyActionStop({ state }: SecretProxyServiceDeps) {
  state.bridge?.close();
  state.bridge = null;
  await state.server?.stop();
  state.forward?.closeAllConnections();
  state.forward?.close();
  state.server = null;
  state.forward = null;
  state.starting = null;
}
