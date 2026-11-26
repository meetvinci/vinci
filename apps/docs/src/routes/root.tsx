import { createRootRoute } from '@tanstack/react-router';
import { DocsRootDocument } from '@/components/docs/docs-root';
import { DOCS } from '@/services/docs/docs.constants';
import appCss from '../application/styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: DOCS.name },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: DocsRootDocument,
});
