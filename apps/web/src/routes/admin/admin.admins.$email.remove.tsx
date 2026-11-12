import { createFileRoute, notFound } from '@tanstack/react-router';
import { AdminAdminRemove } from '@/components/admin/admin-admin-remove';
import { useDialogNavigation } from '@/hooks/use-dialog-navigation';
import { adminAdminsQuery } from '@/services/admin/admin.client';

export const Route = createFileRoute('/admin/admins/$email/remove')({
  loader: async ({ context, params }) => {
    const admins = await context.queryClient.ensureQueryData(adminAdminsQuery());

    if (!admins.some((item) => item.email === params.email)) {
      throw notFound();
    }
  },
  component: AdminAdminRemoveRoute,
});

function AdminAdminRemoveRoute() {
  const { email } = Route.useParams();
  const { handleOpenChange, navigate } = useDialogNavigation({ to: '/admin/admins' });

  return (
    <AdminAdminRemove
      email={email}
      onDone={navigate}
      onOpenChange={handleOpenChange}
    />
  );
}
