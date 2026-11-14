import { secretProxyAllows, secretProxyMapHeaders, secretProxyPlaceholder } from './secret-proxy.utils';
import type { SecretProxyServiceDeps, SecretProxySwapParams, SecretProxySwapped } from '../../types/secret-proxy.types';

export async function secretProxyActionSwap(
  { source }: SecretProxyServiceDeps,
  { request, target }: SecretProxySwapParams,
): Promise<SecretProxySwapped> {
  const carried = JSON.stringify([target.href, request.headers]);
  const rules = (await source.queries.rules()).filter((rule) => carried.includes(secretProxyPlaceholder(rule.name)));
  const refused = rules.find((rule) => target.protocol !== 'https:' || !secretProxyAllows(rule, target.hostname));

  if (refused) {
    return { refusal: `${refused.name} may only be sent over HTTPS to ${refused.hosts.join(', ')}.` };
  }

  const swaps = await Promise.all(rules.map(async ({ name }) => ({
    name,
    placeholder: secretProxyPlaceholder(name),
    value: await source.queries.value({ name }),
  })));

  const missing = swaps.find((swap) => swap.value === null);

  if (missing) {
    return { refusal: `${missing.name} is not stored.` };
  }

  const stored = swaps.flatMap(({ placeholder, value }) => (value === null ? [] : [{ placeholder, value }]));
  const secretProxySwapText = (text: string) => stored.reduce((result, { placeholder, value }) => result.replaceAll(placeholder, value), text);
  const swapped = new URL(target);

  swapped.search = secretProxySwapText(swapped.search);

  return { refusal: null, target: swapped, headers: secretProxyMapHeaders(request.headers, secretProxySwapText) };
}
