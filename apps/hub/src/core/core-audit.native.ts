import { isAppError } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match } from 'ts-pattern';
import type { AuditEntry } from '../types/audit.types';
import type * as CoreTypes from '../types/core.types';

export async function coreAuditChange(
  services: CoreTypes.CoreServices,
  { identity }: CoreTypes.CoreAdminContext,
  change: CoreTypes.CoreAdminChange,
  run: (change: CoreTypes.CoreAdminChange) => Promise<Response>,
): Promise<Response> {
  const entry = { by: identity.email, kind: 'change' as const };

  try {
    const response = await run(change);

    coreAuditRecord(services, {
      ...change,
      ...entry,
      status: response.status,
    });

    return response;
  } catch (error) {
    coreAuditRecord(services, {
      ...change,
      ...entry,
      status: coreAuditStatus(isAppError(error) ? error.code : undefined),
    });

    throw error;
  }
}

export function coreAuditRecord(services: CoreTypes.CoreServices, entry: AuditEntry): boolean {
  try {
    services.audit.actions.record(entry);

    return true;
  } catch (error) {
    log.error({
      tag: 'hub-audit',
      message: entry.kind === 'read' ? 'The audit trail could not record a read; the read is refused' : 'The audit trail could not record a change; the change stands',
      by: entry.by,
      action: entry.action,
      user: entry.userId ?? null,
      error,
    });

    return false;
  }
}

export function coreAuditStatus(code: string | undefined): number {
  return match(code)
    .with('UNAUTHORIZED', () => 401)
    .with('FORBIDDEN', () => 403)
    .with('NOT_FOUND', () => 404)
    .with('CONFLICT', () => 409)
    .with('VALIDATION_ERROR', () => 422)
    .with('RATE_LIMITED', () => 429)
    .otherwise(() => 502);
}
