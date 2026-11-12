import { AUDIT } from './audit.constants';
import { auditDriverList } from './audit.driver';
import { auditDatabase } from './audit.utils';
import type * as AuditTypes from '../../types/audit.types';
import type { AdminAuditPage } from '@repo/contracts/universal';

export function auditQueryList(deps: AuditTypes.AuditServiceDeps, input: AuditTypes.AuditListInput): AdminAuditPage {
  const rows = auditDriverList(auditDatabase(deps), { ...input, limit: AUDIT.pageSize + 1 });
  const entries = rows.slice(0, AUDIT.pageSize);

  return { entries, next: rows.length > AUDIT.pageSize ? entries.at(-1)?.id ?? null : null };
}
