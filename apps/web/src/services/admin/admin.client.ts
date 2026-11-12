import { createRouterUtils } from '@orpc/tanstack-query';
import { makeHttpClient } from '@repo/client/client';
import { queryMutationCache } from '@repo/client/react';
import { adminChangeResult, adminList, adminMe, adminUserCreateResult, adminUserList } from '@repo/contracts/universal';
import { log } from '@repo/logger/client';
import { toasty } from '@repo/ui/sonner';
import { isCancelledError, QueryClient, queryOptions } from '@tanstack/react-query';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminRequest } from '@/services/admin/admin.utils';
import type { AdminRpcParams } from '@/types/admin.types';
import type { RpcContextValue } from '@repo/client/react';
import type { Admin, AdminUserCreate, AdminUserPatch } from '@repo/contracts/universal';

export function adminQueryClient() {
  return new QueryClient({
    mutationCache: queryMutationCache({
      notify: ({ message, variant }) => toasty(message, variant === 'error' ? '⚠️' : '✅'),
      onError: (error) => {
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

export function adminUsersQuery() {
  return queryOptions({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await adminRequest({ path: '/users', schema: adminUserList })).users,
    refetchInterval: (query) => (query.state.data?.some((user) => user.state === 'starting') ? ADMIN.usersRefreshMs : false),
  });
}

export function adminAddAdmin({ email }: Admin) {
  return adminRequest({
    path: '/admins',
    schema: adminChangeResult,
    method: 'POST',
    body: { email },
  });
}

export function adminRemoveAdmin({ email }: Admin) {
  return adminRequest({
    path: `/admins/${encodeURIComponent(email)}`,
    schema: adminChangeResult,
    method: 'DELETE',
  });
}

export function adminCreateUser(input: AdminUserCreate) {
  return adminRequest({
    path: '/users',
    schema: adminUserCreateResult,
    method: 'POST',
    body: input,
  });
}

export function adminUpdateUser({ id, ...input }: AdminUserPatch) {
  return adminRequest({
    path: `/users/${encodeURIComponent(id)}`,
    schema: adminChangeResult,
    method: 'PATCH',
    body: input,
  });
}

export function adminRemoveUser({ id }: Pick<AdminUserPatch, 'id'>) {
  return adminRequest({
    path: `/users/${encodeURIComponent(id)}`,
    schema: adminChangeResult,
    method: 'DELETE',
  });
}

export function adminRpc({ userId }: AdminRpcParams): RpcContextValue {
  const client = makeHttpClient(() => ({ url: `${ADMIN.apiPath}/users/${encodeURIComponent(userId)}/rpc` }));

  return { client, rpc: createRouterUtils(client, { prefix: `admin-user:${userId}` }) };
}
