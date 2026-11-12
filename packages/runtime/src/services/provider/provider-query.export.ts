import { readStoredCredential } from '@earendil-works/pi-coding-agent';
import type * as ProviderTypes from '../../types/provider.types';
import type * as UniversalTypes from '@repo/contracts/universal';

export async function providerQueryExport(deps: ProviderTypes.ProviderServiceDeps): Promise<UniversalTypes.ProviderKeys> {
  const stored = await deps.models.listCredentials();

  return {
    keys: stored.filter(({ type }) => type === 'api_key').flatMap(({ providerId }) => {
      const credential = readStoredCredential(providerId);

      if (credential?.type !== 'api_key' || !credential.key) {
        return [];
      }

      const exported: UniversalTypes.ProviderKeys['keys'][number] = { providerId, key: credential.key };

      if (credential.env) {
        exported.env = credential.env;
      }

      return [exported];
    }),
  };
}
