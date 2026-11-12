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

export interface AdminSectionModeParams extends UniversalTypes.AdminSectionModeInput {
  userId: string
  section: UniversalTypes.AdminSectionId
}

export interface AdminSectionParams {
  userId: string
  section: UniversalTypes.AdminSection
}

export interface AdminBotCopyParams extends UniversalTypes.AdminBotCopyInput {
  userId: string
}

export interface AdminRequestParams<T> {
  path: string
  schema: z.ZodType<T>
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: UniversalTypes.Admin
    | UniversalTypes.AdminUserCreate
    | Omit<UniversalTypes.AdminUserPatch, 'id'>
    | UniversalTypes.AdminSectionModeInput
    | UniversalTypes.AdminGlobalSyncInput
    | UniversalTypes.AdminBotCopyInput
}

export interface AdminBotCopyProblemParams {
  copies: UniversalTypes.AdminBotCopy[]
  bots: Pick<UniversalTypes.Bot, 'id' | 'name'>[]
}

export interface AdminProblemParams {
  error: Error | null
  failed: string
}

export type AdminQueriesStatus = 'pending' | 'error' | 'success';
