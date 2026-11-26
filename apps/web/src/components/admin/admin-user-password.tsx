import { m } from '@repo/i18n/client';
import { ConfirmationDialog } from '@repo/ui/alert-dialog';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { AdminPassword } from '@/components/admin/admin-password';
import { adminResetPassword, adminUsersQuery } from '@/services/admin/admin.client';
import { adminProblem } from '@/services/admin/admin.utils';

interface AdminUserPasswordProps {
  userId: string
  onOpenChange: (open: boolean) => void
}

export function AdminUserPassword({ userId, onOpenChange }: AdminUserPasswordProps) {
  const { data: users } = useSuspenseQuery(adminUsersQuery());
  const user = users.find((item) => item.id === userId);
  const reset = useMutation({ mutationFn: adminResetPassword });

  if (!user) {
    return null;
  }

  if (reset.data) {
    return (
      <AdminPassword
        email={user.email}
        password={reset.data.password}
        title={m.admin_password_new_title({ name: user.name })}
        onDone={() => onOpenChange(false)}
      />
    );
  }

  return (
    <ConfirmationDialog
      confirmLabel={m.admin_password_reset()}
      error={reset.isError ? adminProblem({ error: reset.error, failed: m.admin_password_reset_failed() }) : null}
      pending={reset.isPending}
      title={m.admin_password_reset_title({ name: user.name })}
      onConfirm={() => reset.mutate({ id: user.id })}
      onOpenChange={onOpenChange}
    >
      {m.admin_password_reset_description({ email: user.email })}
    </ConfirmationDialog>
  );
}
