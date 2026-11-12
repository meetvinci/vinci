import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/users/$userId/bots/')({
  beforeLoad: async ({ context, params }) => {
    const bots = await context.queryClient.ensureQueryData(context.userRpc.rpc.bots.list.queryOptions()).catch(() => null);
    const bot = bots?.at(0);

    if (!bots) {
      return;
    }

    throw bot
      ? redirect({
        to: '/admin/users/$userId/bots/$botId/$tab',
        params: { ...params, botId: bot.id, tab: 'profile' },
        replace: true,
      })
      : redirect({
        to: '/admin/users/$userId/bots/create',
        params,
        replace: true,
      });
  },
});
