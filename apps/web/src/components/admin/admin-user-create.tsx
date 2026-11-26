import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { adminUserCreate } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/dialog';
import { Form, FormErrors } from '@repo/ui/forms/form';
import { FormInput } from '@repo/ui/forms/form-input';
import { toasty } from '@repo/ui/sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AdminBotChecklist } from '@/components/admin/admin-bot-checklist';
import { AdminPassword } from '@/components/admin/admin-password';
import { useAdminNotice } from '@/hooks/use-admin-notice';
import { useAdminTemplateBots } from '@/hooks/use-admin-template-bots';
import { adminCreateUser, adminUsersQuery } from '@/services/admin/admin.client';
import { adminBotCopyProblem, adminBotCopySkipped, adminProblem } from '@/services/admin/admin.utils';
import type { AdminUserCreated } from '@/types/admin.types';
import type { AdminUser } from '@repo/contracts/universal';

interface AdminUserCreateProps {
  onCreated: (user: AdminUser) => void
  onOpenChange: (open: boolean) => void
}

export function AdminUserCreate({ onCreated, onOpenChange }: AdminUserCreateProps) {
  const queryClient = useQueryClient();
  const notice = useAdminNotice();
  const templateBots = useAdminTemplateBots();
  const suggested = templateBots.data ?? [];
  const [skipped, setSkipped] = useState<string[]>([]);
  const [created, setCreated] = useState<AdminUserCreated | null>(null);
  const bots = suggested.map((bot) => bot.id).filter((id) => !skipped.includes(id));

  const form = useForm({
    resolver: standardSchemaResolver(adminUserCreate),
    defaultValues: { name: '', email: '' },
  });

  const create = useMutation({
    mutationFn: adminCreateUser,
    meta: { success: m.admin_user_created() },
    onSuccess: async ({ access, password, bots: copies = [], ...user }) => {
      await queryClient.invalidateQueries({ queryKey: adminUsersQuery().queryKey });
      const failed = adminBotCopyProblem({ copies, bots: suggested });
      const leftOut = adminBotCopySkipped({ copies, bots: suggested });

      if (failed) {
        toasty(failed, '⚠️');
      }

      if (leftOut) {
        toasty(leftOut, '⚠️');
      }

      notice({
        access,
        email: user.email,
        change: 'add',
      });

      if (password) {
        setCreated({ user, password });
        return;
      }

      onCreated(user);
    },
  });

  if (created) {
    return (
      <AdminPassword
        email={created.user.email}
        password={created.password}
        title={m.admin_password_created_title({ name: created.user.name })}
        onDone={() => onCreated(created.user)}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !create.isPending && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.admin_users_add()}</DialogTitle>
          <DialogDescription>{m.admin_user_create_hint()}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((input) => create.mutate(suggested.length > 0 ? { ...input, bots } : input))}>
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
            {suggested.length > 0 ? (
              <AdminBotChecklist
                bots={suggested}
                disabled={create.isPending}
                label={m.admin_user_bots()}
                selected={bots}
                onToggle={(botId, isTicked) => setSkipped((current) => (isTicked ? current.filter((id) => id !== botId) : [...current, botId]))}
              />
            ) : null}
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
              <ButtonLoading
                disabled={templateBots.isLoading}
                loading={create.isPending}
                type="submit"
              >
                {m.admin_user_create()}
              </ButtonLoading>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
