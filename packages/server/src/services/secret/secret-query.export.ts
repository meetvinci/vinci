import { secretQueryRules } from './secret-query.rules';
import { secretQueryValue } from './secret-query.value';
import type { SecretServiceDeps } from '../../types/secret.types';
import type { SecretExport } from '@repo/contracts/universal';

export async function secretQueryExport(deps: SecretServiceDeps): Promise<SecretExport> {
  const rules = await secretQueryRules(deps);
  const values = await Promise.all(rules.map(async (rule) => ({ ...rule, value: await secretQueryValue(deps, { name: rule.name }) })));

  return values.flatMap(({ name, hosts, value }) => (value === null ? [] : [{ name, hosts, value }]));
}
