import type * as UniversalTypes from '@repo/contracts/universal';
import type { z } from 'zod';

export interface AdminUserCreated {
  user: UniversalTypes.AdminUser
  password: string
}

export interface AdminRpcParams {
  userId: string
}

export interface AdminSectionModeParams extends UniversalTypes.AdminSectionModeInput {
  userId: string
  section: UniversalTypes.AdminSectionId
}

export interface AdminSectionPreviewParams {
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
    | UniversalTypes.AdminOutsideInput
}

export interface AdminOutsideParams extends UniversalTypes.AdminOutsideInput {
  userId: string
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

export interface AdminAuditPathParams {
  filter: UniversalTypes.AdminAuditFilter
  cursor: number
}

export interface AdminLimitValues {
  device: number
  public: number
  redeem: number
  rpcInFlight: number
  watchInFlight: number
}
