import { secretQueryIsGlobal } from './secret-query.is-global';
import { SECRET } from './secret.constants';
import type { SecretServiceDeps } from '../../types/secret.types';
import type { CredentialsSetInput } from '@repo/contracts/universal';

export async function secretQueryIsGlobalKey(deps: SecretServiceDeps, { key }: Pick<CredentialsSetInput, 'key'>): Promise<boolean> {
  return key.startsWith(SECRET.credentialPrefix) && secretQueryIsGlobal(deps, { name: key.slice(SECRET.credentialPrefix.length) });
}
