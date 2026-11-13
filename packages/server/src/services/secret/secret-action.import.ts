import { secretQueryRules } from './secret-query.rules';
import { SECRET } from './secret.constants';
import type { SecretServiceDeps } from '../../types/secret.types';
import type { SecretExport } from '@repo/contracts/universal';

export async function secretActionImport(deps: SecretServiceDeps, secrets: SecretExport) {
  const rules = await secretQueryRules(deps);
  const names = new Set(secrets.map(({ name }) => name));
  const own = rules.filter((rule) => rule.isGlobal !== true && !names.has(rule.name));

  const writes = [
    ...secrets.map(({ name, value }) => ({ key: `${SECRET.credentialPrefix}${name}`, value })),
    ...rules.filter((rule) => rule.isGlobal === true && !names.has(rule.name)).map(({ name }) => ({ key: `${SECRET.credentialPrefix}${name}`, value: null })),
  ];

  await writes.reduce(async (previous, write) => {
    await previous;
    await deps.credentials.actions.set(write);
  }, Promise.resolve());

  await deps.settings.actions.set({
    records: [{ key: SECRET.rulesSetting, value: JSON.stringify([...own, ...secrets.map(({ name, hosts }) => ({ name, hosts, isGlobal: true }))]) }],
  });
}
