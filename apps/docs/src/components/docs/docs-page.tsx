import { getRouteApi, notFound } from '@tanstack/react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Suspense, use } from 'react';
import { DOCS } from '@/services/docs/docs.constants';
import { docsCollection, docsSource } from '@/services/docs/docs.utils';
import { DocsMdxBlockquote, DocsMdxLink, DocsMdxMermaid } from './docs-mdx';

const route = getRouteApi('/$lang/$');

function DocsPageContent() {
  const { lang, _splat } = route.useParams();
  const page = docsCollection.getPage(docsSource.getPage(_splat?.split('/') ?? [], lang)?.path ?? '');

  if (!page) {
    throw notFound();
  }

  const { toc } = use(page.load());
  const Mdx = page.body;

  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <DocsBody>
        <Mdx components={{ ...defaultMdxComponents, a: DocsMdxLink, blockquote: DocsMdxBlockquote, Mermaid: DocsMdxMermaid }} />
      </DocsBody>
    </DocsPage>
  );
}

export function DocsPageRoute() {
  const { lang } = route.useParams();

  return (
    <DocsLayout nav={{ title: DOCS.name }} tree={docsSource.getPageTree(lang)}>
      <Suspense>
        <DocsPageContent />
      </Suspense>
    </DocsLayout>
  );
}
