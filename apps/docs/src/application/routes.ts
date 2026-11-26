import { index, rootRoute, route } from '@tanstack/virtual-file-routes';

export const routes = rootRoute('root.tsx', [
  index('index.tsx'),
  route('/$lang', [
    index('docs/docs.$lang.index.tsx'),
    route('/$', 'docs/docs.$lang.$.tsx'),
  ]),
]);
