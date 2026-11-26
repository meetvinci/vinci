import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { fumadocsMdx } from 'fumadocs-mdx/vite';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import { routes } from './src/application/routes.ts';
import { DOCS } from './src/services/docs/docs.constants.ts';

export default defineConfig({
  clearScreen: false,
  server: {
    host: true,
    port: 3020,
  },
  plugins: [
    fumadocsMdx(),
    tailwindcss(),
    tanstackStart({
      router: {
        entry: join('application', 'router.tsx'),
        generatedRouteTree: join('application', 'routes.tree.ts'),
        quoteStyle: 'double',
        semicolons: true,
        virtualRouteConfig: routes,
      },
      // The site is static: every page is rendered at build time and no server runs in production.
      spa: {
        enabled: true,
        // The shell is the site's index.html: it answers / and sends the reader to the first page.
        prerender: { enabled: true, crawlLinks: true, outputPath: '/index.html' },
      },
      pages: DOCS.languages.map((language) => ({ path: `/${language}` })),
    }),
    viteReact(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
