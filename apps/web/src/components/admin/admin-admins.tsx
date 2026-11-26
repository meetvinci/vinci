import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { admin } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Form, FormErrors } from '@repo/ui/forms/form';
import { FormInput } from '@repo/ui/forms/form-input';
import { Panel, PanelContent, PanelDescription, PanelRow, PanelTitle } from '@repo/ui/panel';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AdminAccess, AdminAccessNotice } from '@/components/admin/admin-access';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminPassword } from '@/components/admin/admin-password';
import { useAdminNotice } from '@/hooks/use-admin-notice';
import { adminAddAdmin, adminAdminsQuery, adminHasAccountsQuery, adminMeQuery } from '@/services/admin/admin.client';
import { adminProblem } from '@/services/admin/admin.utils';

export function AdminAdmins() {
  const queryClient = useQueryClient();
  const notice = useAdminNotice();
  const { data: admins } = useSuspenseQuery(adminAdminsQuery());
  const { data: me } = useSuspenseQuery(adminMeQuery());
  const { data: hasAccounts } = useSuspenseQuery(adminHasAccountsQuery());
  const [created, setCreated] = useState<{ email: string, password: string } | null>(null);
  const isLast = admins.length <= 1;

  const form = useForm({
    resolver: standardSchemaResolver(admin),
    defaultValues: { email: '' },
  });

  const add = useMutation({
    mutationFn: adminAddAdmin,
    meta: { success: m.admin_admins_added() },
    onSuccess: async ({ access, password }, { email }) => {
      await queryClient.invalidateQueries({ queryKey: adminAdminsQuery().queryKey });
      notice({
        access,
        email,
        change: 'add',
      });
      form.reset();

      if (password) {
        setCreated({ email, password });
      }
    },
  });

  return (
    <>
      {created ? (
        <AdminPassword
          email={created.email}
          once={m.admin_admins_password_once()}
          password={created.password}
          title={m.admin_password_created_title({ name: created.email })}
          onDone={() => setCreated(null)}
        />
      ) : null}
      <AdminPageHeader description={hasAccounts ? m.admin_admins_hint_accounts() : m.admin_admins_hint()} title={m.admin_admins_title()} />
      <AdminAccessNotice domains={undefined} isUnknown={admins.some((item) => item.access === 'unknown')} />
      <Panel className="max-w-3xl">
        {admins.map((item) => (
          <PanelRow key={item.email}>
            <PanelContent>
              <PanelTitle className="truncate">{item.email}</PanelTitle>
              {item.email === me.email ? <PanelDescription>{m.admin_admins_you()}</PanelDescription> : null}
            </PanelContent>
            <AdminAccess access={item.access} />
            {isLast ? null : (
              <Button
                asChild
                size="sm"
                variant="outline"
              >
                <Link params={{ email: item.email }} to="/admin/admins/$email/remove">{m.admin_admins_remove()}</Link>
              </Button>
            )}
          </PanelRow>
        ))}
        <PanelRow className="items-start">
          <Form {...form}>
            <form className="flex min-w-0 flex-1 flex-col gap-2" onSubmit={form.handleSubmit(({ email }) => add.mutate({ email }))}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <FormInput
                    aria-label={m.admin_admins_email()}
                    autoComplete="email"
                    disabled={add.isPending}
                    name="email"
                    placeholder={m.admin_admins_email_placeholder()}
                    type="email"
                  />
                </div>
                <ButtonLoading loading={add.isPending} type="submit">{m.admin_admins_add()}</ButtonLoading>
              </div>
              <FormErrors error={add.isError ? adminProblem({ error: add.error, failed: m.admin_admins_add_failed() }) : null} />
              {isLast ? <PanelDescription>{m.admin_admins_last()}</PanelDescription> : null}
            </form>
          </Form>
        </PanelRow>
      </Panel>
    </>
  );
}
