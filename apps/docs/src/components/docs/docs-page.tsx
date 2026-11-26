import { getRouteApi, notFound } from '@tanstack/react-router';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Suspense, use } from 'react';
import { DOCS } from '@/services/docs/docs.constants';
import { docsCollection } from '@/services/docs/docs.utils';

const route = getRouteApi('/$lang/$');

interface DocsPageContentProps {
  path: string;
}

function DocsPageContent({ path }: DocsPageContentProps) {
  const page = docsCollection.getPage(path);

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
        <Mdx components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export function DocsPageRoute() {
  const { path, pageTree } = useFumadocsLoader(route.useLoaderData());

  return (
    <DocsLayout nav={{ title: DOCS.name }} tree={pageTree}>
      <Suspense>
        <DocsPageContent path={path} />
      </Suspense>
    </DocsLayout>
  );
}
