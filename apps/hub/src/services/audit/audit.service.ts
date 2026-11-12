import { log } from '@repo/logger/server';
import { join } from 'node:path';
import { auditActionRecord } from './audit-action.record';
import { auditQueryList } from './audit-query.list';
import { AUDIT } from './audit.constants';
import { auditDatabase } from './audit.utils';
import type * as AuditTypes from '../../types/audit.types';

export function makeAuditService({ directory }: AuditTypes.AuditServiceParams) {
  const deps: AuditTypes.AuditServiceDeps = { path: join(directory, AUDIT.file), state: { database: null } };

  try {
    auditDatabase(deps);
  } catch (error) {
    log.error({
      tag: 'hub-audit',
      message: `Audit trail ${deps.path} cannot be opened: admin reads are refused until it is fixed`,
      error,
    });
  }

  return {
    queries: {
      list: (input: AuditTypes.AuditListInput) => auditQueryList(deps, input),
    },
    actions: {
      record: (entry: AuditTypes.AuditEntry) => auditActionRecord(deps, entry),
      close: () => deps.state.database?.close(),
    },
  };
}

export type AuditService = ReturnType<typeof makeAuditService>;
