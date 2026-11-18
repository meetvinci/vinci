import { match } from 'ts-pattern';
import { MCP } from './mcp.constants';
import type { SecretRule } from '@repo/contracts/universal';

export function mcpIsHostAllowed(rules: SecretRule[], secret: string, host: string) {
  return rules
    .find((rule) => rule.name === secret)
    ?.hosts.some((pattern) => (pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern)) ?? false;
}

export function mcpIsUrlAllowed(internalAllow: string[], url: string) {
  const { protocol, hostname, port } = new URL(url);

  return match(protocol)
    .with('https:', () => true)
    .otherwise(() => MCP.ipv4.test(hostname) && internalAllow.includes(`${hostname}:${port === '' ? '80' : port}`));
}
