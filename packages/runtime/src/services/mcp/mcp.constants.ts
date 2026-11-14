export const MCP = {
  maxFileNameLength: 120,
  maxFileCollisions: 100,
  maxMessageBytes: 16 * 1024 * 1024,
  maxPendingWrites: 1_000,
  maxToolPages: 4,
  oversizeEdgeBytes: 4096,
  truncatedMeta: 'meetvinci/truncated',
  closeTimeoutMs: 2_000,
  requestTimeoutMs: 10_000,
  commandRequestTimeoutMs: 60_000,
} as const;
