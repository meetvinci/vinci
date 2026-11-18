export const MCP = {
  pathsSetting: 'mcp.paths',
  defaults: {
    paths: [],
  },
  secretPrefix: 'secrets.',
  derivedPrefix: 'mcp.',
  derivedKey: /^mcp\.[\da-f-]{36}\.(?<rest>.+)$/u,
  ownedFile: 'mcp.json',
  botFolderMessage: 'Not read: a bot can write this file, and bots run their tools in a sandbox. Move it to a shared MCP file or set the server in the panel.',
} as const;
