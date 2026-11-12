import { createFileRoute, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/users/$userId/bots/$botId')({
  loader: async ({ context, params }) => {
    const bots = await context.queryClient.ensureQueryData(context.userRpc.rpc.bots.list.queryOptions()).catch(() => null);

    if (bots && !bots.some((item) => item.id === params.botId)) {
      throw notFound();
    }
  },
});
