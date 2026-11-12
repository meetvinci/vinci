import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AdminUserRemove } from '@/components/admin/admin-user-remove';
import { useDialogNavigation } from '@/hooks/use-dialog-navigation';

export const Route = createFileRoute('/admin/users/$userId/remove')({
  component: AdminUserRemoveRoute,
});

function AdminUserRemoveRoute() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const { handleOpenChange } = useDialogNavigation({ to: '/admin/users/$userId', params: { userId } });

  return (
    <AdminUserRemove
      userId={userId}
      onDone={() => void navigate({ to: '/admin/users', replace: true })}
      onOpenChange={handleOpenChange}
    />
  );
}
