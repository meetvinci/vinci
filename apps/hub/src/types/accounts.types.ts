import { z } from 'zod';
import type { AuditService } from '../services/audit/audit.service';

export const accountsPutReply = z.object({ created: z.boolean(), password: z.string().min(1).optional() });

export const accountsPasswordReply = z.object({ password: z.string().min(1) });

export const accountsDeleteReply = z.object({ deleted: z.boolean() });

export type AccountsPut = z.infer<typeof accountsPutReply>;

export interface AccountsServiceParams {
  url: string | undefined;
  token: string | undefined;
  audit: AuditService;
}

export interface AccountsConfig {
  url: string;
  token: string;
}

export interface AccountsServiceDeps {
  config: AccountsConfig | null;
  audit: AuditService;
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
  method: 'PUT' | 'POST' | 'DELETE';
  path: string;
  body?: object;
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

export type AccountsRequest<T extends z.ZodType> = Pick<AccountsCallParams<T>, 'method' | 'path' | 'body' | 'schema'>;
