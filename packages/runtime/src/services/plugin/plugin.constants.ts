export const PLUGIN = {
  indexes: ['index.ts', 'index.js', 'index.mjs'],
  skip: ['node_modules', '.git'],
  messages: {
    read: 'Cannot read plugin source.',
    import: 'Cannot import plugin.',
    invalid: 'Invalid plugin. Expected a default export Pi extension.',
    botFolder: 'Skipped a shared plugin inside a bot folder: a bot can write it, so it would run bot code in the daemon.',
  },
};
