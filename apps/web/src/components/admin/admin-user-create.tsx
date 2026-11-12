import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { adminUserCreate } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/dialog';
import { Form, FormErrors } from '@repo/ui/forms/form';
import { FormInput } from '@repo/ui/forms/form-input';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useAdminNotice } from '@/hooks/use-admin-notice';
import { adminCreateUser, adminUsersQuery } from '@/services/admin/admin.client';
import { adminProblem } from '@/services/admin/admin.utils';
import type { AdminUser } from '@repo/contracts/universal';

interface AdminUserCreateProps {
  onCreated: (user: AdminUser) => void
  onOpenChange: (open: boolean) => void
}

export function AdminUserCreate({ onCreated, onOpenChange }: AdminUserCreateProps) {
  const queryClient = useQueryClient();
  const notice = useAdminNotice();

  const form = useForm({
    resolver: standardSchemaResolver(adminUserCreate),
    defaultValues: { name: '', email: '' },
  });

  const create = useMutation({
    mutationFn: adminCreateUser,
    meta: { success: m.admin_user_created() },
    onSuccess: async ({ access, ...user }) => {
      await queryClient.invalidateQueries({ queryKey: adminUsersQuery().queryKey });
      notice({
        access,
        email: user.email,
        change: 'add',
      });
      onCreated(user);
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !create.isPending && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.admin_users_add()}</DialogTitle>
          <DialogDescription>{m.admin_user_create_hint()}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((input) => create.mutate(input))}>
            <fieldset className="flex flex-col gap-4" disabled={create.isPending}>
              <FormInput
                autoComplete="name"
                label={m.admin_user_name()}
                name="name"
              />
              <FormInput
                autoComplete="email"
                hint={m.admin_user_email_hint()}
                label={m.admin_user_email()}
                name="email"
                type="email"
              />
            </fieldset>
            <FormErrors error={create.isError ? adminProblem({ error: create.error, failed: m.admin_user_create_failed() }) : null} />
            <DialogFooter>
              <Button
                disabled={create.isPending}
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {m.ui_cancel()}
              </Button>
              <ButtonLoading loading={create.isPending} type="submit">{m.admin_user_create()}</ButtonLoading>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
