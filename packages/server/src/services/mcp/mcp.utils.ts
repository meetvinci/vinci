import type { SecretRule } from '@repo/contracts/universal';

export function mcpIsHostAllowed(rules: SecretRule[], secret: string, host: string) {
  return rules
    .find((rule) => rule.name === secret)
    ?.hosts.some((pattern) => (pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern)) ?? false;
}
