import { createFileRoute, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/users/$userId/devices/$deviceId/revoke')({
  loader: async ({ context, params }) => {
    const devices = await context.queryClient.ensureQueryData(context.userRpc.rpc.devices.list.queryOptions()).catch(() => null);

    if (devices && !devices.some((item) => item.id === params.deviceId)) {
      throw notFound();
    }
  },
});
