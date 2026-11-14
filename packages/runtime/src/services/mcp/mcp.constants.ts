export const MCP = {
  maxFileNameLength: 120,
  maxFileCollisions: 100,
  maxMessageBytes: 16 * 1024 * 1024,
  maxPendingWrites: 1_000,
  maxToolPages: 4,
  closeTimeoutMs: 2_000,
} as const;
