import { BlockList } from 'node:net';
import { secretProxyActionStart } from './secret-proxy-action.start';
import { secretProxyActionStop } from './secret-proxy-action.stop';
import { secretProxyQueryEnv } from './secret-proxy-query.env';
import { SECRET_PROXY } from './secret-proxy.constants';
import { secretProxyPlaceholder, secretProxyRedact } from './secret-proxy.utils';
import type * as SecretProxyTypes from '../../types/secret-proxy.types';
import type { SecretValueParams } from '../../types/secret.types';

export function makeSecretProxyService(params: SecretProxyTypes.SecretProxyServiceParams) {
  const internal = new BlockList();

  for (const [address, prefix, family] of SECRET_PROXY.internalRanges) {
    internal.addSubnet(address, prefix, family);
  }

  const deps: SecretProxyTypes.SecretProxyServiceDeps = {
    ...params,
    internal,
    state: { token: '', forwardKey: '', server: null, forward: null, forwardUrl: '', starting: null },
  };

  return {
    actions: {
      start: () => secretProxyActionStart(deps),
      stop: () => secretProxyActionStop(deps),
    },
    queries: {
      env: () => secretProxyQueryEnv(deps),
      redact: (text: string) => deps.state.token ? secretProxyRedact(deps.state.token, text) : text,
      placeholder: ({ name }: SecretValueParams) => secretProxyPlaceholder(name),
    },
  };
}

export type SecretProxyService = ReturnType<typeof makeSecretProxyService>;
