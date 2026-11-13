import { Database } from 'bun:sqlite';
import { closeSync, openSync } from 'node:fs';
import { AUDIT } from './audit.constants';
import type * as AuditTypes from '../../types/audit.types';
import type { AdminAuditEntry } from '@repo/contracts/universal';

export function auditDriverOpen(path: string): Database {
  closeSync(openSync(path, 'a', 0o600));

  const database = new Database(path, { strict: true });

  try {
    database.exec(AUDIT.schema);
  } catch (error) {
    database.close();
    throw error;
  }

  return database;
}

export function auditDriverInsert(database: Database, entry: AuditTypes.AuditEntry): void {
  database.query(`
    INSERT INTO audit (created_at, admin, kind, action, detail, user_id, bot_id, conversation_id, status)
    VALUES ($createdAt, $by, $kind, $action, $detail, $userId, $botId, $conversationId, $status)
  `).run({
    createdAt: Date.now(),
    by: entry.by,
    kind: entry.kind,
    action: entry.action,
    detail: entry.detail ?? null,
    userId: entry.userId ?? null,
    botId: entry.botId ?? null,
    conversationId: entry.conversationId ?? null,
    status: entry.status,
  });
}

export function auditDriverList(database: Database, { cursor, by, user, kind, limit }: AuditTypes.AuditListInput & { limit: number }): AdminAuditEntry[] {
  return database.query<AdminAuditEntry, Record<string, string | number | null>>(`
    SELECT id, created_at AS createdAt, admin AS by, kind, action, detail, user_id AS userId, bot_id AS botId, conversation_id AS conversationId, status
    FROM audit
    WHERE ($cursor IS NULL OR id < $cursor)
      AND ($by IS NULL OR admin = $by)
      AND ($user IS NULL OR user_id = $user)
      AND ($kind IS NULL OR kind = $kind)
    ORDER BY id DESC
    LIMIT $limit
  `).all({
    cursor: cursor ?? null,
    by: by ?? null,
    user: user ?? null,
    kind: kind ?? null,
    limit,
  });
}

export function auditDriverLastStart(database: Database, by: string): number | null {
  return database.query<{ id: number | null }, { by: string }>(`
    SELECT max(id) AS id FROM audit WHERE admin = $by AND action = 'global/sync'
  `).get({ by })?.id ?? null;
}
