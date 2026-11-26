import { ORPCError } from '@orpc/client';
import { m } from '@repo/i18n/client';
import { ConfirmationDialog } from '@repo/ui/alert-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminNotice } from '@/hooks/use-admin-notice';
import { adminAdminsQuery, adminHasAccountsQuery, adminRemoveAdmin } from '@/services/admin/admin.client';
import { adminProblem } from '@/services/admin/admin.utils';

interface AdminAdminRemoveProps {
  email: string
  onDone: () => void
  onOpenChange: (open: boolean) => void
}

export function AdminAdminRemove({ email, onDone, onOpenChange }: AdminAdminRemoveProps) {
  const queryClient = useQueryClient();
  const notice = useAdminNotice();
  const { data: hasAccounts = false } = useQuery(adminHasAccountsQuery());

  const remove = useMutation({
    mutationFn: adminRemoveAdmin,
    meta: { success: m.admin_admins_removed() },
    onSuccess: async ({ access }) => {
      await queryClient.invalidateQueries({ queryKey: adminAdminsQuery().queryKey });
      notice({
        access,
        email,
        change: 'remove',
      });
      onDone();
    },
  });

  const problem = remove.error instanceof ORPCError && remove.error.code === 'CONFLICT'
    ? m.admin_admins_last()
    : adminProblem({ error: remove.error, failed: m.admin_admins_remove_failed() });

  return (
    <ConfirmationDialog
      confirmLabel={m.admin_admins_remove()}
      error={remove.isError ? problem : null}
      pending={remove.isPending}
      title={m.admin_admins_remove_title({ email })}
      variant="destructive"
      onConfirm={() => remove.mutate({ email })}
      onOpenChange={onOpenChange}
    >
      {hasAccounts ? m.admin_admins_remove_description_accounts() : m.admin_admins_remove_description()}
    </ConfirmationDialog>
  );
}
