import { ORPCError } from '@orpc/client';
import { adminRelayRefusal } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { m } from '@repo/i18n/client';
import { linkOptions } from '@tanstack/react-router';
import { match, P } from 'ts-pattern';
import { ADMIN } from '@/services/admin/admin.constants';
import { SETTINGS_NAV } from '@/services/settings/settings.constants';
import type * as AdminTypes from '@/types/admin.types';
import type { SectionScope } from '@/types/section.types';
import type { AdminUserState, SettingsSection } from '@repo/contracts/universal';

export function adminSectionScope(userId: string): SectionScope {
  return {
    isAdmin: true,
    settings: {
      section: (tab) => linkOptions({
        to: '/admin/users/$userId/settings/$tab',
        params: { userId, tab },
        replace: true,
      }),
      model: (model) => linkOptions({
        to: '/admin/users/$userId/settings/models/$model',
        params: { userId, model },
        replace: true,
      }),
      providerLogout: (providerId) => linkOptions({
        to: '/admin/users/$userId/settings/providers/$providerId/logout',
        params: { userId, providerId },
        replace: true,
      }),
      deviceRevoke: (deviceId) => linkOptions({
        to: '/admin/users/$userId/devices/$deviceId/revoke',
        params: { userId, deviceId },
        replace: true,
      }),
    },
    bots: {
      list: linkOptions({
        to: '/admin/users/$userId/bots',
        params: { userId },
        replace: true,
      }),
      create: linkOptions({
        to: '/admin/users/$userId/bots/create',
        params: { userId },
        replace: true,
      }),
      section: (botId, tab) => linkOptions({
        to: '/admin/users/$userId/bots/$botId/$tab',
        params: { userId, botId, tab },
        replace: true,
      }),
      skillsLocal: (botId) => linkOptions({
        to: '/admin/users/$userId/bots/$botId/skills/local',
        params: { userId, botId },
        replace: true,
      }),
      reset: (botId) => linkOptions({
        to: '/admin/users/$userId/bots/$botId/reset',
        params: { userId, botId },
        replace: true,
      }),
      remove: (botId) => linkOptions({
        to: '/admin/users/$userId/bots/$botId/delete',
        params: { userId, botId },
        replace: true,
      }),
      mcpRemove: (botId, server) => linkOptions({ to: '/admin/users/$userId/bots/$botId/mcp/$server/remove', params: { userId, botId, server } }),
    },
    rooms: null,
  };
}

export function adminRpcPrefix(userId: string): string {
  return `admin-user:${userId}`;
}

export function adminIsSectionRefused(error: Error): boolean {
  if (!(error instanceof ORPCError)) {
    return false;
  }

  return adminRelayRefusal.safeParse(error.data).success;
}

export function adminBotCopyProblem({ copies, bots }: AdminTypes.AdminBotCopyProblemParams): string | null {
  const failed = copies.filter((copy) => copy.botId === null).map((copy) => {
    const name = bots.find((bot) => bot.id === copy.from)?.name ?? copy.from;

    return copy.error ? `${name} (${copy.error})` : name;
  });

  return failed.length > 0 ? m.admin_bots_copy_partial({ bots: failed.join(', ') }) : null;
}

export function adminSectionLabel(section: SettingsSection): string {
  return SETTINGS_NAV.find((item) => item.id === section)?.label() ?? section;
}

export function adminProblem({ error, failed }: AdminTypes.AdminProblemParams): string {
  return match(error)
    .with(P.instanceOf(ORPCError), (failure) => match(failure.code)
      .with('UNAUTHORIZED', () => m.admin_signed_out())
      .with('FORBIDDEN', () => m.admin_forbidden())
      .otherwise(() => failed))
    .otherwise(() => failed);
}

export async function adminRequest<T>({ path, schema, method = 'GET', body }: AdminTypes.AdminRequestParams<T>): Promise<T> {
  const response = await fetch(`${ADMIN.apiPath}${path}`, {
    method,
    headers: method === 'GET' ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    throw match(response.status)
      .with(0, 401, () => new Errors.UNAUTHORIZED({ internal: `Admin API ${method} ${path}: signed out` }))
      .with(403, () => new Errors.FORBIDDEN({ internal: `Admin API ${method} ${path}` }))
      .with(404, () => new Errors.NOT_FOUND({ internal: `Admin API ${method} ${path}` }))
      .with(409, () => new Errors.CONFLICT({ internal: `Admin API ${method} ${path}` }))
      .otherwise((status) => new Errors.INTERNAL_ERROR({ internal: `Admin API ${method} ${path}: ${String(status)}` }));
  }

  const text = await response.text();

  return schema.parse(text === '' ? {} : JSON.parse(text));
}

export function adminStateLabel(state: AdminUserState): { label: string; tone: 'success' | 'warning' | 'default' } {
  return match(state)
    .with('running', () => ({ label: m.admin_state_running(), tone: 'success' as const }))
    .with('starting', () => ({ label: m.admin_state_starting(), tone: 'warning' as const }))
    .with('stopped', () => ({ label: m.admin_state_stopped(), tone: 'default' as const }))
    .with('unknown', () => ({ label: m.admin_state_unknown(), tone: 'default' as const }))
    .exhaustive();
}

export function adminQueriesStatus(results: { isError: boolean; isPending: boolean }[]): AdminTypes.AdminQueriesStatus {
  return match(results)
    .when((all) => all.some((result) => result.isError), () => 'error' as const)
    .when((all) => all.some((result) => result.isPending), () => 'pending' as const)
    .otherwise(() => 'success' as const);
}
