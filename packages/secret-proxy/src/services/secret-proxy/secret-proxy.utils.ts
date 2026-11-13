import { isIPv4 } from 'node:net';
import { SECRET_PROXY } from './secret-proxy.constants';
import type { SecretProxyServiceDeps } from '../../types/secret-proxy.types';
import type { SecretRule } from '../../types/secret.types';
import type { Headers } from 'mockttp';

export function secretProxyPassword(token: string) {
  return Buffer.from(JSON.stringify({ tags: [token] })).toString('base64url');
}

export function secretProxyRedact(token: string, text: string) {
  const password = secretProxyPassword(token);
  return [Buffer.from(`metadata:${password}`).toString('base64'), password, token]
    .reduce((result, value) => result.replaceAll(value, '[proxy credential]'), text);
}

export function secretProxyPlaceholder(name: string) {
  return `${SECRET_PROXY.placeholderPrefix}${name}${SECRET_PROXY.placeholderSuffix}`;
}

export function secretProxyAllows(rule: SecretRule, host: string) {
  const name = host.replace(/\.+$/u, '');
  return rule.hosts.some((pattern) => (pattern.startsWith('*.') ? name.endsWith(pattern.slice(1)) : name === pattern));
}

export function secretProxyIsLocal(address: string | undefined) {
  return SECRET_PROXY.loopback.some((loopback) => loopback === address);
}

export function secretProxyIsInternal({ internal, internalAllow }: SecretProxyServiceDeps, address: string, port: number) {
  const family = isIPv4(address) ? 'ipv4' : 'ipv6';
  return internal.check(address, family) && !internalAllow.includes(`${address}:${String(port)}`);
}

export function secretProxyMapHeaders(headers: Headers, map: (value: string) => string): Headers {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, Array.isArray(value) ? value.map(map) : value && map(value)]));
}
