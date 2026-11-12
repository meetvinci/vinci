export const WORKSPACE = {
  sharedFolder: '.agents',
  botFolders: ['.pi', '.agents'],
  skippedNames: ['node_modules', '.git'],
  directoryMode: 0o700,
  fileMode: 0o600,
  executableMode: 0o700,
} as const;
