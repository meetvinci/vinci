import { env } from '@repo/env/client';
import { createFileRoute } from '@tanstack/react-router';
import { SEO_THEME_COLOR } from '@/services/seo/seo.constants';

export const Route = createFileRoute('/img/favicon/site.webmanifest')({
  server: {
    handlers: {
      GET: () => Response.json({
        name: env.VITE_APP_NAME,
        short_name: env.VITE_APP_NAME,
        id: '/',
        start_url: '/',
        scope: '/',
        icons: [192, 512].flatMap((size) => ['any', 'maskable'].map((purpose) => ({
          src: `/img/favicon/web-app-manifest-${size}x${size}.png`,
          sizes: `${size}x${size}`,
          type: 'image/png',
          purpose,
        }))),
        theme_color: SEO_THEME_COLOR.light,
        background_color: SEO_THEME_COLOR.light,
        display: 'standalone',
      }, { headers: { 'content-type': 'application/manifest+json' } }),
    },
  },
});
