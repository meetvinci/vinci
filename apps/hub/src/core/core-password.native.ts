import { teamPasswordInput } from '@repo/contracts/universal';
import { env } from '@repo/env/server';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import type * as CoreTypes from '../types/core.types';
import type { TeamPasswordRefusal } from '@repo/contracts/universal';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function corePassword(services: CoreTypes.CoreServices, { request, publicUrl, identity }: CoreTypes.CoreAdminContext): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, { status: 404, headers: NO_STORE });
  }

  if (request.headers.get('origin') !== publicUrl.origin || !/^application\/json(?:;|$)/iu.test(request.headers.get('content-type') ?? '')) {
    throw new Errors.FORBIDDEN({ internal: 'A password change without a same-origin Origin and JSON' });
  }

  const input = teamPasswordInput.safeParse(await request.json().catch(() => null));

  if (!input.success) {
    return corePasswordRefusal({ error: 'invalid' }, 422);
  }

  try {
    await services.accounts.actions.change({
      ...input.data,
      token: identity.token,
      email: identity.email,
      by: identity.email,
    });
  } catch (error) {
    const refusal = match(error)
      .with({ code: 'FORBIDDEN' }, () => ({ refusal: { error: 'wrong_password' as const }, status: 403 }))
      .with({ code: 'RATE_LIMITED', data: { retryAfter: P.number.select() } }, (retryAfter) => ({ refusal: { error: 'too_many_attempts' as const, retryAfter }, status: 429 }))
      .with({ code: 'VALIDATION_ERROR' }, () => ({ refusal: { error: 'invalid' as const }, status: 422 }))
      .otherwise(() => null);

    if (!refusal) {
      throw error;
    }

    return corePasswordRefusal(refusal.refusal, refusal.status);
  }

  await corePasswordFirst(services, identity.email);

  return new Response(null, { status: 204, headers: NO_STORE });
}

function corePasswordRefusal(refusal: TeamPasswordRefusal, status: number): Response {
  return Response.json(refusal, { status, headers: NO_STORE });
}

async function corePasswordFirst(services: CoreTypes.CoreServices, email: string): Promise<void> {
  if (!env.HUB_ADMIN_EMAILS.includes(email) || !services.provisioner.queries.isConfigured()) {
    return;
  }

  await services.provisioner.actions.forgetFirstPassword().then(({ removed }) => {
    if (removed) {
      log.info({ tag: 'hub', message: 'The first admin changed their password; the provisioner deleted /opt/vinci/admin-password' });
    }
  }).catch((error: unknown) => log.warn({
    tag: 'hub',
    message: 'The provisioner could not delete /opt/vinci/admin-password; the password change stands',
    error,
  }));
}
