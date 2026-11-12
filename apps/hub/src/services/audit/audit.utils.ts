import { auditDriverOpen } from './audit.driver';
import type * as AuditTypes from '../../types/audit.types';
import type { Database } from 'bun:sqlite';

export function auditDatabase({ path, state }: AuditTypes.AuditServiceDeps): Database {
  state.database ??= auditDriverOpen(path);

  return state.database;
}
