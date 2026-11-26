import { defineI18n } from 'fumadocs-core/i18n';
import { loader } from 'fumadocs-core/source';
import { defineDocs } from 'fumadocs-mdx/macro';
import { uiTranslations } from 'fumadocs-ui/i18n';
import { DOCS } from './docs.constants';

const docsI18n = defineI18n({
  defaultLanguage: DOCS.defaultLanguage,
  languages: [...DOCS.languages],
  parser: 'dot',
});

export const docsTranslations = docsI18n
  .translations()
  .extend(uiTranslations())
  .add({
    en: { displayName: DOCS.languageNames.en },
    'pt-PT': { displayName: DOCS.languageNames['pt-PT'] },
    de: { displayName: DOCS.languageNames.de },
    es: { displayName: DOCS.languageNames.es },
    fr: { displayName: DOCS.languageNames.fr },
  });

export const docsCollection = defineDocs({
  dir: '../../docs',
  docs: {
    async: true,
    files: ['install/**/*.mdx', 'use/**/*.mdx', 'changelog/**/*.mdx'],
  },
  meta: {
    files: ['meta*.json'],
  },
});

export const docsSource = loader({
  source: docsCollection.toFumadocsSource(),
  baseUrl: '/',
  i18n: docsI18n,
});
