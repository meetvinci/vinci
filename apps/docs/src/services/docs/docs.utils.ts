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
    files: ['install/**/*.{md,mdx}', 'use/**/*.mdx', 'changelog/**/*.{md,mdx}'],
  },
  meta: {
    files: ['**/meta*.json'],
  },
});

export const docsSource = loader({
  source: docsCollection.toFumadocsSource(),
  baseUrl: '/',
  i18n: docsI18n,
  pageTree: { sort: { options: { numeric: true } } },
});

export function docsPageHref(href: string, slugs: string[], language: string) {
  const page = docsSource.getPage(slugs, language);

  if (!page || /^([a-z]+:|\/|#)/.test(href)) {
    return href;
  }

  const relative = href.startsWith('.') ? href : `./${href}`;
  const resolved = docsSource.resolveHref(relative, page);

  if (resolved !== relative) {
    return resolved;
  }

  const { pathname, hash } = new URL(relative, `file:///docs/${page.path}`);

  return `${DOCS.repositoryUrl}${pathname}${hash}`;
}

export function docsChangelogVersions(language: string) {
  return docsSource
    .getPages(language)
    .filter((page) => page.slugs[0] === DOCS.changelogSlug && page.slugs.length === 2)
    .sort((a, b) => b.path.localeCompare(a.path, undefined, { numeric: true }));
}
