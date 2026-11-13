import type { AdminSectionId } from '@repo/contracts/universal';

export const GLOBAL = {
  file: 'global.json',
  socketOrigin: 'http://localhost',
  sections: [
    { id: 'models', procedures: ['providers/', 'models/'] },
    { id: 'chat', procedures: ['conversation/settings', 'conversation/configure'] },
    { id: 'tools', procedures: ['tools/settings', 'tools/configure'] },
    { id: 'secrets', procedures: ['secrets/', 'credentials/'] },
    {
      id: 'sources',
      procedures: [
        'skills/settings',
        'skills/configure',
        'instructions/settings',
        'instructions/configure',
        'plugins/settings',
        'plugins/configure',
        'mcp/settings',
        'mcp/configure',
      ],
    },
  ] satisfies { id: AdminSectionId; procedures: string[] }[],
  reads: ['list', 'settings', 'session'],
  ownWrites: ['secrets/remove'],
  errorMaxLength: 300,
  startAttempts: 30,
  startRetryMs: 2000,
};
