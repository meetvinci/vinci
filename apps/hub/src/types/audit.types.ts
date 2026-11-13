import { adminAuditKind } from '@repo/contracts/universal';
import { z } from 'zod';
import { userId } from './user.types';
import type { AdminAuditEntry } from '@repo/contracts/universal';
import type { Database } from 'bun:sqlite';

export const auditListInput = z.strictObject({
  cursor: z.coerce.number().int().positive().optional(),
  by: z.email().transform((email) => email.toLowerCase()).optional(),
  user: userId.optional(),
  kind: adminAuditKind.optional(),
});

export type AuditListInput = z.infer<typeof auditListInput>;

export type AuditEntry = Omit<AdminAuditEntry, 'id' | 'createdAt' | 'detail' | 'userId' | 'botId' | 'conversationId'> & Partial<Pick<AdminAuditEntry, 'detail' | 'userId' | 'botId' | 'conversationId'>>;

export interface AuditLastStartParams {
  by: string;
}

export interface AuditServiceParams {
  directory: string;
}

export interface AuditServiceDeps {
  path: string;
  state: { database: Database | null };
}
