import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import { accessClaims, accessHeader } from '../../types/access.types';
import { ACCESS } from './access.constants';
import { accessDriverKeys } from './access.driver';
import type * as AccessTypes from '../../types/access.types';

export async function accessQueryVerify(deps: AccessTypes.AccessServiceDeps, { token }: AccessTypes.AccessVerifyParams): Promise<AccessTypes.AccessIdentity> {
  const { state } = deps;
  const parts = token.split('.');
  const [encodedHeader = '', encodedClaims = '', encodedSignature = ''] = parts;
  const header = accessHeader.safeParse(encodedHeader);
  const claims = accessClaims.safeParse(encodedClaims);

  if (parts.length !== 3 || !header.success || !claims.success) {
    throw new Errors.UNAUTHORIZED({ internal: 'Malformed Access token' });
  }

  const now = Date.now();
  const isKnown = state.keys.has(header.data.kid) && now - state.fetchedAt <= ACCESS.keysMaxAgeMs;

  if (!isKnown && !state.loading && now - state.attemptedAt > ACCESS.refetchFloorMs) {
    state.attemptedAt = now;
    state.loading = accessDriverKeys(deps.teamDomain)
      .then((keys) => {
        state.keys = keys;
        state.fetchedAt = Date.now();
      })
      .catch((error: unknown) => log.error({
        tag: 'hub',
        message: 'Access keys could not be refreshed',
        error,
      }))
      .finally(() => {
        state.loading = null;
      });
  }

  await state.loading;

  const key = state.keys.get(header.data.kid);

  if (!key) {
    throw new Errors.UNAUTHORIZED({ internal: 'Access token signed with an unknown key' });
  }

  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
  const isSigned = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, Buffer.from(encodedSignature, 'base64url'), signed).catch(() => false);
  const nowSeconds = now / 1000;

  const failure = match(claims.data)
    .when(() => !isSigned, () => 'bad signature')
    .when(({ iss }) => iss !== deps.teamDomain, () => 'wrong issuer')
    .when(({ aud }) => ![aud].flat().includes(deps.audience), () => 'wrong audience')
    .when(({ exp }) => exp + ACCESS.leewaySeconds < nowSeconds, () => 'expired')
    .when(({ nbf }) => (nbf ?? 0) - ACCESS.leewaySeconds > nowSeconds, () => 'not yet valid')
    .otherwise(() => null);

  return match({ failure, email: claims.data.email })
    .with({ failure: null, email: P.string }, ({ email }) => ({ email: email.toLowerCase(), token, expiresAt: claims.data.exp * 1000 }))
    .otherwise(() => {
      throw new Errors.UNAUTHORIZED({ internal: `Access token rejected: ${failure ?? 'no email'}` });
    });
}
