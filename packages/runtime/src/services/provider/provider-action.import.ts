import { CredentialSynchronizationError } from '@earendil-works/pi-coding-agent';
import { Errors } from '@repo/errors/universal';
import { match, P } from 'ts-pattern';
import { PROVIDER } from './provider.constants';
import type * as ProviderTypes from '../../types/provider.types';
import type * as UniversalTypes from '@repo/contracts/universal';

export async function providerActionImport(deps: ProviderTypes.ProviderServiceDeps, { keys }: UniversalTypes.ProviderKeys): Promise<void> {
  await Promise.all(keys.map(async ({ providerId, key, env }) => {
    match(deps.models.getProvider(providerId)?.auth.apiKey)
      .when((apiKey) => apiKey?.login !== undefined, () => undefined)
      .otherwise(() => {
        throw new Errors.VALIDATION_ERROR({ fields: { keys: { message: 'validation_provider_login_unsupported' } }, internal: `No API-key login for ${providerId}` });
      });

    const answers = [key, ...Object.values(env ?? {})];

    await deps.models.login(providerId, 'api_key', {
      signal: AbortSignal.timeout(PROVIDER.importTimeoutMs),
      prompt: async () => match(answers.shift())
        .with(P.string, (answer) => answer)
        .otherwise(() => {
          throw new Errors.VALIDATION_ERROR({ fields: { keys: { message: 'validation_provider_import_prompt' } }, internal: `${providerId} asked for more than the key and its env values` });
        }),
      notify: () => undefined,
    }, { agentName: PROVIDER.agentName }).catch((error: unknown) => match(error)
      .with(P.instanceOf(CredentialSynchronizationError), () => undefined)
      .otherwise(() => {
        throw error;
      }));
  }));

  const kept = new Set(keys.map(({ providerId }) => providerId));
  const stored = await deps.models.listCredentials();
  const removed = stored.filter(({ type, providerId }) => type === 'api_key' && !kept.has(providerId));

  await Promise.all(removed.map(async ({ providerId }) => deps.models.logout(providerId).catch((error: unknown) => match(error)
    .with(P.instanceOf(CredentialSynchronizationError), () => undefined)
    .otherwise(() => {
      throw error;
    }))));
}
