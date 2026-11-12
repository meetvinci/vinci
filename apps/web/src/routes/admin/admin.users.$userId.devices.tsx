import { m } from '@repo/i18n/client';
import { createFileRoute, useParams } from '@tanstack/react-router';
import { AdminUserDevices } from '@/components/admin/admin-user';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/admin/users/$userId/devices')({
  head: () => seoHead({ title: m.settings_devices() }),
  loader: ({ context }) => context.queryClient.prefetchQuery(context.userRpc.rpc.devices.list.queryOptions()),
  component: AdminUserDevicesRoute,
});

function AdminUserDevicesRoute() {
  const { userId } = Route.useParams();
  const { deviceId } = useParams({ strict: false });

  return <AdminUserDevices revokeId={deviceId} userId={userId} />;
}
