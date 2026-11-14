import { join } from 'node:path';
import { SECRET_PROXY } from './secret-proxy.constants';
import { secretProxyPlaceholder } from './secret-proxy.utils';
import type { SecretProxyServiceDeps } from '../../types/secret-proxy.types';

export async function secretProxyQueryEnv({ source, state, folder, sandboxDir }: SecretProxyServiceDeps): Promise<Record<string, string>> {
  const rules = await source.queries.rules();

  if (!state.server) {
    return {};
  }

  const port = sandboxDir ? SECRET_PROXY.sandboxPort : state.port;
  const proxyUrl = `http://${SECRET_PROXY.user}:${state.token}@${SECRET_PROXY.host}:${String(port)}`;
  const bundlePath = join(sandboxDir ?? folder, SECRET_PROXY.bundleFile);

  return {
    ...Object.fromEntries(rules.map((rule) => [rule.name, secretProxyPlaceholder(rule.name)])),
    ...Object.fromEntries(SECRET_PROXY.proxyEnv.map((name) => [name, proxyUrl])),
    ...Object.fromEntries(SECRET_PROXY.noProxyEnv.map((name) => [name, SECRET_PROXY.noProxy])),
    ...Object.fromEntries(SECRET_PROXY.basicAuthEnv.map((name) => [name, 'basic'])),
    ...Object.fromEntries(SECRET_PROXY.caEnv.map((name) => [name, bundlePath])),
  };
}
