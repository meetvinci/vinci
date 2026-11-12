import { Errors } from '@repo/errors/universal';
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { TEAM } from './team.constants';
import { teamParse } from './team.utils';
import type { TeamOverrideParams } from '@/types/team.types';
import type { TeamWhoami } from '@repo/contracts/universal';

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

  return teamParse(await fetch(new URL(TEAM.whoamiPath, env.WEB_HUB_URL), {
    headers: { accept: 'application/json', ...connectionAccessHeaders(request.headers) },
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
