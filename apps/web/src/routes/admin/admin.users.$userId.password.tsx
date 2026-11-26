import { createFileRoute } from '@tanstack/react-router';
import { AdminUserPassword } from '@/components/admin/admin-user-password';
import { useDialogNavigation } from '@/hooks/use-dialog-navigation';

export const Route = createFileRoute('/admin/users/$userId/password')({
  component: AdminUserPasswordRoute,
});

function AdminUserPasswordRoute() {
  const { userId } = Route.useParams();
  const { handleOpenChange } = useDialogNavigation({ to: '/admin/users/$userId', params: { userId } });

  return <AdminUserPassword userId={userId} onOpenChange={handleOpenChange} />;
}
