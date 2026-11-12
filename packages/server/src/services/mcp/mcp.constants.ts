export const MCP = {
  pathsSetting: 'mcp.paths',
  defaults: {
    paths: [],
  },
  secretPrefix: 'secrets.',
  derivedPrefix: 'mcp.',
  derivedKey: /^mcp\.[\da-f-]{36}\.(?<rest>.+)$/u,
  maxHeaders: 8,
  ownedFile: 'mcp.json',
} as const;
