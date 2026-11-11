import { Errors } from '@repo/errors/universal';
import { accessKeys } from '../../types/access.types';
import { ACCESS } from './access.constants';

export async function accessDriverKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const response = await fetch(new URL(ACCESS.certsPath, teamDomain), { signal: AbortSignal.timeout(ACCESS.fetchTimeoutMs) });

  if (!response.ok) {
    throw new Errors.INTERNAL_ERROR({ internal: `Access keys answered ${response.status}` });
  }

  const { keys } = accessKeys.parse(await response.json());

  const imported = await Promise.all(keys.filter((key) => key.kty === 'RSA').map(async ({ kid, n, e }) => [
    kid,
    await crypto.subtle.importKey('jwk', {
      kty: 'RSA',
      n,
      e,
      alg: 'RS256',
      ext: true,
    }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
  ] as const));

  return new Map(imported);
}
