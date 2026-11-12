import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/users/$userId/settings/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/admin/users/$userId/settings/$tab',
      params: { ...params, tab: 'general' },
      replace: true,
    });
  },
});
