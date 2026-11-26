import { z } from 'zod';
import type { AuditService } from '../services/audit/audit.service';

export const accountsPutReply = z.object({ created: z.boolean(), password: z.string().min(1).optional() });

export const accountsPasswordReply = z.object({ password: z.string().min(1) });

export const accountsDeleteReply = z.object({ deleted: z.boolean() });

export const accountsSessionReply = z.object({ email: z.email(), expires_at: z.number() });

export const accountsChangedReply = z.object({ changed: z.literal(true) });

export const accountsRefusal = z.object({ seconds: z.number().optional() });

export type AccountsPut = z.infer<typeof accountsPutReply>;

export interface AccountsServiceParams extends AccountsConfig {
  audit: AuditService;
}

export interface AccountsConfig {
  url: string;
  token: string;
}

export interface AccountsServiceDeps {
  config: AccountsConfig;
  audit: AuditService;
  sessions: Map<string, AccountsSessionEntry>;
}

export interface AccountsSession {
  email: string;
  token: string;
  expiresAt: number;
}

export interface AccountsSessionEntry {
  until: number;
  identity: Promise<AccountsSession>;
  email: string | null;
}

export interface AccountsForgetParams {
  email: string;
  keep?: string;
}

export interface AccountsSessionParams {
  token: string;
}

export interface AccountsChangeParams extends AccountsTarget {
  token: string;
  current: string;
  password: string;
}

export interface AccountsTarget {
  email: string;
  userId?: string;
  by: string;
}

export interface AccountsPutParams extends AccountsTarget {
  name: string | null;
}

export interface AccountsCallParams<T extends z.ZodType> extends AccountsTarget {
  action: string;
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  path: string;
  body?: object;
  cookie?: string;
  schema: T;
}

export interface AccountsPathParams {
  email: string;
  suffix?: string;
}

export interface AccountsRecordParams extends AccountsTarget {
  action: string;
  status: number;
}

export type AccountsRequest<T extends z.ZodType> = Pick<AccountsCallParams<T>, 'method' | 'path' | 'body' | 'cookie' | 'schema'>;
