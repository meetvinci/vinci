import { secretQueryRules } from './secret-query.rules';
import type { SecretServiceDeps, SecretValueParams } from '../../types/secret.types';

export async function secretQueryIsGlobal(deps: SecretServiceDeps, { name }: SecretValueParams): Promise<boolean> {
  return (await secretQueryRules(deps)).some((rule) => rule.name === name && rule.isGlobal === true);
}
