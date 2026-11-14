import { timingSafeEqual } from 'node:crypto';
import { isIPv4 } from 'node:net';
import { SECRET_PROXY } from './secret-proxy.constants';
import type { SecretProxyServiceDeps } from '../../types/secret-proxy.types';
import type { SecretRule } from '../../types/secret.types';
import type { IncomingHttpHeaders } from 'node:http';

export function secretProxyRedact(token: string, text: string) {
  return [Buffer.from(`${SECRET_PROXY.user}:${token}`).toString('base64'), token]
    .reduce((result, value) => result.replaceAll(value, '[proxy credential]'), text);
}

export function secretProxyIsAuthorized(token: string, headers: IncomingHttpHeaders) {
  const [scheme = '', encoded = ''] = (headers['proxy-authorization'] ?? '').split(' ');
  const decoded = Buffer.from(encoded, 'base64').toString();
  const password = Buffer.from(decoded.slice(decoded.indexOf(':') + 1));
  const expected = Buffer.from(token);

  return scheme.toLowerCase() === 'basic' && password.length === expected.length && timingSafeEqual(password, expected);
}

export function secretProxyPlaceholder(name: string) {
  return `${SECRET_PROXY.placeholderPrefix}${name}${SECRET_PROXY.placeholderSuffix}`;
}

export function secretProxyAllows(rule: SecretRule, host: string) {
  const name = host.replace(/\.+$/u, '');
  return rule.hosts.some((pattern) => (pattern.startsWith('*.') ? name.endsWith(pattern.slice(1)) : name === pattern));
}

export function secretProxyIsInternal({ internal, internalAllow }: SecretProxyServiceDeps, address: string, port: number) {
  const family = isIPv4(address) ? 'ipv4' : 'ipv6';
  return internal.check(address, family) && !internalAllow.includes(`${address}:${String(port)}`);
}

export function secretProxyMapHeaders(headers: IncomingHttpHeaders, map: (value: string) => string): IncomingHttpHeaders {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, Array.isArray(value) ? value.map(map) : value && map(value)]));
}
