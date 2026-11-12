import type * as UniversalTypes from '@repo/contracts/universal';
import type { z } from 'zod';

export interface AdminNotice {
  email: string
  change: 'add' | 'remove'
}

export interface AdminNoticeParams extends AdminNotice {
  access: UniversalTypes.AdminAccess | undefined
}

export interface AdminRpcParams {
  userId: string
}

export interface AdminRequestParams<T> {
  path: string
  schema: z.ZodType<T>
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: UniversalTypes.Admin | UniversalTypes.AdminUserCreate | Omit<UniversalTypes.AdminUserPatch, 'id'>
}

export interface AdminProblemParams {
  error: Error | null
  failed: string
}

export type AdminQueriesStatus = 'pending' | 'error' | 'success';
