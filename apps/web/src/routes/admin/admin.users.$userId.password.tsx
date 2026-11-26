import { createFileRoute, notFound } from '@tanstack/react-router';
import { AdminUserPassword } from '@/components/admin/admin-user-password';
import { useDialogNavigation } from '@/hooks/use-dialog-navigation';
import { adminUserListQuery } from '@/services/admin/admin.client';

export const Route = createFileRoute('/admin/users/$userId/password')({
  loader: async ({ context }) => {
    const { hasAccounts } = await context.queryClient.ensureQueryData(adminUserListQuery());

    if (!hasAccounts) {
      throw notFound();
    }
  },
  component: AdminUserPasswordRoute,
});

function AdminUserPasswordRoute() {
  const { userId } = Route.useParams();
  const { handleOpenChange } = useDialogNavigation({ to: '/admin/users/$userId', params: { userId } });

  return <AdminUserPassword userId={userId} onOpenChange={handleOpenChange} />;
}
