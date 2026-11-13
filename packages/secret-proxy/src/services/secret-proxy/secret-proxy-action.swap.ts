import { SECRET_PROXY } from './secret-proxy.constants';
import { secretProxyAllows, secretProxyMapHeaders, secretProxyPlaceholder } from './secret-proxy.utils';
import type { SecretProxyServiceDeps, SecretProxySwapParams } from '../../types/secret-proxy.types';
import type { requestSteps } from 'mockttp';

export async function secretProxyActionSwap(
  { source, state }: SecretProxyServiceDeps,
  { request }: SecretProxySwapParams,
): Promise<requestSteps.CallbackRequestResult> {
  const url = new URL(request.url);
  const carried = JSON.stringify([request.url, request.headers]);
  const rules = (await source.queries.rules()).filter((rule) => carried.includes(secretProxyPlaceholder(rule.name)));
  const refused = rules.find((rule) => url.protocol !== 'https:' || !secretProxyAllows(rule, url.hostname));

  if (refused) {
    return { response: { statusCode: 403, body: `${refused.name} may only be sent over HTTPS to ${refused.hosts.join(', ')}.\n` } };
  }

  const swaps = await Promise.all(rules.map(async ({ name }) => ({
    name,
    placeholder: secretProxyPlaceholder(name),
    value: await source.queries.value({ name }),
  })));

  const missing = swaps.find((swap) => swap.value === null);

  if (missing) {
    return { response: { statusCode: 403, body: `${missing.name} is not stored.\n` } };
  }

  const stored = swaps.flatMap(({ placeholder, value }) => (value === null ? [] : [{ placeholder, value }]));
  const secretProxySwapText = (text: string) => stored.reduce((result, { placeholder, value }) => result.replaceAll(placeholder, value), text);

  url.search = secretProxySwapText(url.search);
  const length = request.headers['content-length'];

  return {
    url: state.forwardUrl,
    headers: {
      ...secretProxyMapHeaders(request.headers, secretProxySwapText),
      host: undefined,
      ':authority': undefined,
      'content-length': undefined,
      'transfer-encoding': length === undefined ? request.headers['transfer-encoding'] : 'chunked',
      [SECRET_PROXY.forwardKeyHeader]: state.forwardKey,
      [SECRET_PROXY.forwardTargetHeader]: url.toString(),
      [SECRET_PROXY.forwardLengthHeader]: length,
    },
  };
}
