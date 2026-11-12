import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AdminUserCreate } from '@/components/admin/admin-user-create';
import { useDialogNavigation } from '@/hooks/use-dialog-navigation';

export const Route = createFileRoute('/admin/users/create')({
  component: AdminUserCreateRoute,
});

function AdminUserCreateRoute() {
  const navigate = useNavigate();
  const { handleOpenChange } = useDialogNavigation({ to: '/admin/users' });

  return (
    <AdminUserCreate
      onCreated={(user) => void navigate({
        to: '/admin/users/$userId',
        params: { userId: user.id },
        replace: true,
      })}
      onOpenChange={handleOpenChange}
    />
  );
}
