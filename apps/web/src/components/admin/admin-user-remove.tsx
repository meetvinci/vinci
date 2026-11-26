import { m } from '@repo/i18n/client';
import { ConfirmationDialog } from '@repo/ui/alert-dialog';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { adminRemoveUser, adminUsersQuery } from '@/services/admin/admin.client';
import { adminProblem } from '@/services/admin/admin.utils';

interface AdminUserRemoveProps {
  userId: string
  onDone: () => void
  onOpenChange: (open: boolean) => void
}

export function AdminUserRemove({ userId, onDone, onOpenChange }: AdminUserRemoveProps) {
  const queryClient = useQueryClient();
  const { data: users } = useSuspenseQuery(adminUsersQuery());
  const user = users.find((item) => item.id === userId);

  const remove = useMutation({
    mutationFn: adminRemoveUser,
    meta: { success: m.admin_user_removed() },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminUsersQuery().queryKey });
      onDone();
    },
  });

  if (!user) {
    return null;
  }

  return (
    <ConfirmationDialog
      confirmLabel={m.admin_user_remove()}
      confirmText={user.email}
      error={remove.isError ? adminProblem({ error: remove.error, failed: m.admin_user_remove_failed() }) : null}
      pending={remove.isPending}
      title={m.admin_user_remove_title({ name: user.name })}
      variant="destructive"
      onConfirm={() => remove.mutate({ id: user.id })}
      onOpenChange={onOpenChange}
    >
      {m.admin_user_remove_description({ email: user.email })}
    </ConfirmationDialog>
  );
}
