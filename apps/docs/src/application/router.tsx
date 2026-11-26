import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routes.tree';

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}
