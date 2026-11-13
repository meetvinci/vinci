import { auditDriverLastStart } from './audit.driver';
import { auditDatabase } from './audit.utils';
import type * as AuditTypes from '../../types/audit.types';

export function auditQueryLastStart(deps: AuditTypes.AuditServiceDeps, { by }: AuditTypes.AuditLastStartParams): number | null {
  try {
    return auditDriverLastStart(auditDatabase(deps), by);
  } catch {
    return null;
  }
}
