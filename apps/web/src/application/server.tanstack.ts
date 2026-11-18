import { runWithLocale } from '@repo/i18n/server';
import { log } from '@repo/logger/server';
import { createServerEntry, createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';
import { match } from 'ts-pattern';
import { localeForRequest } from '@/services/locale/locale.utils';
import type { Register } from '@tanstack/react-start';

const handleStartRequest = createStartHandler((context) => {
  for (const route of context.router.state.matches.filter((item) => item.status === 'error')) {
    log.error({
      tag: 'router',
      message: 'Route load failed',
      error: route.error,
      routeId: route.routeId,
    });
  }

  return defaultStreamHandler(context);
});

export default createServerEntry<Register>({
  async fetch(request, options) {
    const url = new URL(request.url);

    return match(url.pathname !== '/' && url.pathname.endsWith('/'))
      .with(true, () => {
        url.pathname = url.pathname.slice(0, -1);

        return new Response(null, { status: 308, headers: { Location: url.toString() } });
      })
      .with(false, async () => {
        try {
          const response = await runWithLocale(localeForRequest(request), () => handleStartRequest(request, options));
          response.headers.set('Cache-Control', 'private, no-store');

          return response;
        } catch (error) {
          if (request.signal.aborted && error === request.signal.reason) {
            return new Response(null, { status: 499 });
          }

          throw error;
        }
      })
      .exhaustive();
  },
});
