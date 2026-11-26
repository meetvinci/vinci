export const DOCS = {
  name: 'Vinci',
  defaultLanguage: 'en',
  languages: ['en', 'pt-PT', 'de', 'es', 'fr'],
  languageNames: {
    en: 'English',
    'pt-PT': 'Português',
    de: 'Deutsch',
    es: 'Español',
    fr: 'Français',
  },
  homeSlug: 'install',
  publicFiles: ['install/server-tour.html'],
  repositoryUrl: 'https://github.com/meetvinci/vinci/blob/main',
} as const;

export const DOCS_ALERT = {
  attribute: 'data-alert',
  calloutTypes: ['info', 'idea', 'warn', 'error'],
  markers: [
    { marker: '[!NOTE]', type: 'info' },
    { marker: '[!TIP]', type: 'idea' },
    { marker: '[!IMPORTANT]', type: 'info' },
    { marker: '[!WARNING]', type: 'warn' },
    { marker: '[!CAUTION]', type: 'error' },
  ],
} as const;
