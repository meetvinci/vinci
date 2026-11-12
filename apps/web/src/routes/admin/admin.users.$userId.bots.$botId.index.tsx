import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/users/$userId/bots/$botId/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/admin/users/$userId/bots/$botId/$tab',
      params: { ...params, tab: 'profile' },
      replace: true,
    });
  },
});
