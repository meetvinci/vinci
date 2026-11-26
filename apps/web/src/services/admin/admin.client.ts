import { createRouterUtils } from '@orpc/tanstack-query';
import { CHAT, makeHttpClient } from '@repo/client/client';
import { queryMutationCache } from '@repo/client/react';
import { adminAuditPage, adminBotCopyResult, adminChangeResult, adminGlobal, adminGlobalStatus, adminList, adminMe, adminOutsideResult, adminPassword, adminSectionPreview, adminUserCreateResult, adminUserList, adminUserSections, AVATAR } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { log } from '@repo/logger/client';
import { toasty } from '@repo/ui/sonner';
import { infiniteQueryOptions, isCancelledError, QueryClient, queryOptions } from '@tanstack/react-query';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminAuditPath, adminIsSectionRefused, adminRequest, adminRpcPrefix } from '@/services/admin/admin.utils';
import type * as AdminTypes from '@/types/admin.types';
import type { RpcContextValue } from '@repo/client/react';
import type * as UniversalTypes from '@repo/contracts/universal';

export function adminQueryClient() {
  const client: QueryClient = new QueryClient({
    mutationCache: queryMutationCache({
      notify: ({ message, variant }) => toasty(message, variant === 'error' ? '⚠️' : '✅'),
      errorMessage: (error) => (adminIsSectionRefused(error) ? m.admin_section_refused() : undefined),
      onError: (error) => {
        if (adminIsSectionRefused(error)) {
          void client.invalidateQueries({ queryKey: ['admin', 'sections'] });
          return;
        }

        if (!isCancelledError(error)) {
          log.error({ action: 'admin_mutation_error', error });
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: ADMIN.staleMs,
        retry: false,
      },
    },
  });

  client.getMutationCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success' || event.mutation.options.mutationKey?.[0] !== adminRpcPrefix(ADMIN.templateId)) {
      return;
    }

    void client.invalidateQueries({ queryKey: ['admin', 'sections'] });
    client.getQueryData(adminUserListQuery().queryKey)?.users.forEach((user) => void client.invalidateQueries({ queryKey: [adminRpcPrefix(user.id)], refetchType: 'none' }));
  });

  return client;
}

export function adminMeQuery() {
  return queryOptions({
    queryKey: ['admin', 'me'],
    queryFn: () => adminRequest({ path: '/me', schema: adminMe }),
  });
}

export function adminAdminsQuery() {
  return queryOptions({
    queryKey: ['admin', 'admins'],
    queryFn: async () => (await adminRequest({ path: '/admins', schema: adminList })).admins,
  });
}

export function adminUserListQuery() {
  return queryOptions({
    queryKey: ['admin', 'users'],
    queryFn: () => adminRequest({ path: '/users', schema: adminUserList }),
    refetchInterval: (query) => (query.state.data?.users.some((user) => user.state === 'starting') ? ADMIN.usersRefreshMs : false),
  });
}

export function adminGlobalQuery() {
  return queryOptions({
    queryKey: ['admin', 'global'],
    queryFn: () => adminRequest({ path: '/global', schema: adminGlobal }),
    refetchInterval: (query) => (query.state.data?.state === 'starting' ? ADMIN.usersRefreshMs : false),
  });
}

export function adminAuditQuery(filter: UniversalTypes.AdminAuditFilter) {
  return infiniteQueryOptions({
    queryKey: ['admin', 'audit', filter],
    queryFn: ({ pageParam }) => adminRequest({ path: adminAuditPath({ filter, cursor: pageParam }), schema: adminAuditPage }),
    initialPageParam: 0,
    getNextPageParam: (page) => page.next ?? undefined,
  });
}

export function adminUserSectionsQuery({ userId }: AdminTypes.AdminRpcParams) {
  return queryOptions({
    queryKey: ['admin', 'sections', 'user', userId],
    queryFn: async ({ client, queryKey }) => {
      const wasPending = client.getQueryData<UniversalTypes.AdminSection[]>(queryKey)?.some((section) => section.sync === 'pending');
      const { sections } = await adminRequest({ path: `/users/${encodeURIComponent(userId)}/sections`, schema: adminUserSections });

      if (wasPending && !sections.some((section) => section.sync === 'pending')) {
        await client.invalidateQueries({ queryKey: [adminRpcPrefix(userId)] });
      }

      return sections;
    },
    refetchInterval: (query) => (query.state.data?.some((section) => section.sync === 'pending') ? ADMIN.syncRefreshMs : false),
  });
}

export function adminGlobalStatusQuery() {
  return queryOptions({
    queryKey: ['admin', 'sections', 'status'],
    queryFn: async () => (await adminRequest({ path: '/global/status', schema: adminGlobalStatus })).users,
    refetchInterval: (query) => (query.state.data?.some((user) => user.sections.some((section) => section.sync === 'pending')) ? ADMIN.syncRefreshMs : false),
  });
}

export function adminSectionPreviewQuery({ userId, section }: AdminTypes.AdminSectionPreviewParams) {
  return queryOptions({
    queryKey: ['admin', 'preview', userId, section],
    queryFn: () => adminRequest({ path: `/users/${encodeURIComponent(userId)}/sections/${section}/preview`, schema: adminSectionPreview }),
    staleTime: 0,
    gcTime: 0,
  });
}

export function adminSetSectionMode({ userId, section, mode, marker }: AdminTypes.AdminSectionModeParams) {
  return adminRequest({
    path: `/users/${encodeURIComponent(userId)}/sections/${section}`,
    schema: adminChangeResult,
    method: 'PUT',
    body: { mode, marker },
  });
}

export function adminGlobalSync(input: UniversalTypes.AdminGlobalSyncInput) {
  return adminRequest({
    path: '/global/sync',
    schema: adminChangeResult,
    method: 'POST',
    body: input,
  });
}

export function adminCopyBots({ userId, bots }: AdminTypes.AdminBotCopyParams) {
  return adminRequest({
    path: `/users/${encodeURIComponent(userId)}/bots/copy`,
    schema: adminBotCopyResult,
    method: 'POST',
    body: { bots },
  });
}

export function adminUsersQuery() {
  return queryOptions({ ...adminUserListQuery(), select: ({ users }) => users });
}

export function adminAddAdmin({ email }: UniversalTypes.Admin) {
  return adminRequest({
    path: '/admins',
    schema: adminChangeResult,
    method: 'POST',
    body: { email },
  });
}

export function adminRemoveAdmin({ email }: UniversalTypes.Admin) {
  return adminRequest({
    path: `/admins/${encodeURIComponent(email)}`,
    schema: adminChangeResult,
    method: 'DELETE',
  });
}

export function adminCreateUser(input: UniversalTypes.AdminUserCreate) {
  return adminRequest({
    path: '/users',
    schema: adminUserCreateResult,
    method: 'POST',
    body: input,
  });
}

export function adminUpdateUser({ id, ...input }: UniversalTypes.AdminUserPatch) {
  return adminRequest({
    path: `/users/${encodeURIComponent(id)}`,
    schema: adminChangeResult,
    method: 'PATCH',
    body: input,
  });
}

export function adminRemoveUser({ id }: Pick<UniversalTypes.AdminUserPatch, 'id'>) {
  return adminRequest({
    path: `/users/${encodeURIComponent(id)}`,
    schema: adminChangeResult,
    method: 'DELETE',
  });
}

export function adminResetPassword({ id }: Pick<UniversalTypes.AdminUserPatch, 'id'>) {
  return adminRequest({
    path: `/users/${encodeURIComponent(id)}/password`,
    schema: adminPassword,
    method: 'POST',
  });
}

export async function adminLoadOutside({ userId, botId, conversationId }: AdminTypes.AdminOutsideParams): Promise<void> {
  await adminRequest({
    path: `/users/${encodeURIComponent(userId)}/outside`,
    schema: adminOutsideResult,
    method: 'POST',
    body: { botId, conversationId },
  });
}

export function adminRpc({ userId }: AdminTypes.AdminRpcParams): RpcContextValue {
  const user = `${ADMIN.apiPath}/users/${encodeURIComponent(userId)}`;
  const client = makeHttpClient(() => ({ url: `${user}/rpc` }));

  return {
    client,
    rpc: createRouterUtils(client, { prefix: adminRpcPrefix(userId) }),
    avatarSrc: (src) => (src.startsWith(AVATAR.pathPrefix) ? `${user}${src}` : src),
    fileSrc: (path) => (path.startsWith(`${CHAT.filesPath}/`) ? `${user}${path}` : path),
    hasLinkPreviews: false,
  };
}
