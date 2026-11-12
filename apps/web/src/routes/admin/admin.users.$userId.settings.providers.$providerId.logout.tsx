import { createFileRoute, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/users/$userId/settings/providers/$providerId/logout')({
  loader: async ({ context, params }) => {
    const list = await context.queryClient.ensureQueryData(context.userRpc.rpc.providers.list.queryOptions()).catch(() => null);
    const provider = list?.providers.find((item) => item.id === params.providerId);

    if (list && (!provider?.isConfigured || provider.source !== 'stored')) {
      throw notFound();
    }
  },
});
