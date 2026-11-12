import { log } from '@repo/logger/server';
import { match } from 'ts-pattern';
import { auditDriverInsert } from './audit.driver';
import { auditDatabase } from './audit.utils';
import type * as AuditTypes from '../../types/audit.types';

export function auditActionRecord(deps: AuditTypes.AuditServiceDeps, entry: AuditTypes.AuditEntry): void {
  log.info({
    tag: 'hub-audit',
    message: match(entry)
      .with({ kind: 'change' }, () => 'Admin made a change')
      .when(({ action }) => /^(?:routines|todos)\//u.test(action), () => 'Admin read routines or todos')
      .otherwise(() => 'Admin read a conversation'),
    by: entry.by,
    kind: entry.kind,
    action: entry.action,
    detail: entry.detail ?? null,
    user: entry.userId ?? null,
    bot: entry.botId ?? null,
    conversation: entry.conversationId ?? null,
    status: entry.status,
  });

  auditDriverInsert(auditDatabase(deps), entry);
}
