export const PROVIDER = {
  maxSessions: 8,
  maxRetainedSessions: 64,
  maxEvents: 32,
  sessionTimeoutMs: 600_000,
  agentName: 'bots',
  importTimeoutMs: 30_000,
} as const;
