import { createFileRoute, notFound } from '@tanstack/react-router';
import { DocsPageRoute } from '@/components/docs/docs-page';
import { docsCollection, docsSource } from '@/services/docs/docs.utils';

export const Route = createFileRoute('/$lang/$')({
  component: DocsPageRoute,
  loader: async ({ params }) => {
    const page = docsSource.getPage(params._splat?.split('/') ?? [], params.lang);

    if (!page) {
      throw notFound();
    }

    await docsCollection.getPage(page.path)?.preload();

    return {
      path: page.path,
      pageTree: await docsSource.serializePageTree(docsSource.getPageTree(params.lang)),
    };
  },
});
