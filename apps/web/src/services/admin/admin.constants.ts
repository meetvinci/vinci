export const ADMIN = {
  apiPath: '/admin/api',
  templateId: 'template',
  syncRefreshMs: 2000,
  usersRefreshMs: 5000,
  staleMs: 10 * 1000,
  previewChanges: ['removed', 'changed', 'added'],
} as const;
