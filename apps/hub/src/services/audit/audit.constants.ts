export const AUDIT = {
  file: 'audit.sqlite',
  pageSize: 50,
  schema: `
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      admin TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('read', 'change')),
      action TEXT NOT NULL,
      detail TEXT,
      user_id TEXT,
      bot_id TEXT,
      conversation_id INTEGER,
      status INTEGER NOT NULL
    );
  `,
};
