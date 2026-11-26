import { teamPasswordRefusal } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { match } from 'ts-pattern';
import { TEAM } from './team.constants';
import { teamParse } from './team.utils';
import type { TeamOverrideParams } from '@/types/team.types';
import type { TeamPasswordInput, TeamWhoami } from '@repo/contracts/universal';

const teamRead = createServerFn({ method: 'GET' }).handler(async (): Promise<TeamWhoami | null> => {
  const [{ env }, { getRequest }, { connectionAccessHeaders }] = await Promise.all([
    import('@repo/env/server'),
    import('@tanstack/react-start/server'),
    import('@/services/connection/connection.utils'),
  ]);

  if (!env.WEB_HUB_URL) {
    return null;
  }

  const request = getRequest();
  const headers = connectionAccessHeaders(request.headers);

  headers.set('accept', 'application/json');

  return teamParse(await fetch(new URL(TEAM.whoamiPath, env.WEB_HUB_URL), {
    headers,
    redirect: 'manual',
    signal: request.signal,
  }));
});

export function teamQuery() {
  return queryOptions({
    queryKey: TEAM.queryKey,
    queryFn: () => teamRead(),
  });
}

export async function teamOverride({ section }: TeamOverrideParams): Promise<void> {
  const response = await fetch(`/hub/sections/${section}/override`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: '{}',
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    throw new Errors.INTERNAL_ERROR({ internal: `The hub answered ${String(response.status)} to a section override` });
  }
}

export async function teamPasswordChange(input: TeamPasswordInput): Promise<void> {
  const response = await fetch(TEAM.passwordPath, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (response.status === 204) {
    return;
  }

  const internal = `The hub answered ${String(response.status)} to a password change`;
  const refusal = teamPasswordRefusal.safeParse(await response.json().catch(() => null)).data;

  throw match(refusal)
    .with({ error: 'wrong_password' }, () => new Errors.FORBIDDEN({ internal }))
    .with({ error: 'too_many_attempts' }, ({ retryAfter }) => new Errors.RATE_LIMITED({ internal, retryAfter: retryAfter ?? 60 }))
    .with({ error: 'invalid' }, () => new Errors.VALIDATION_ERROR({ internal, fields: {} }))
    .otherwise(() => new Errors.SERVER_UNREACHABLE({ internal }));
}
