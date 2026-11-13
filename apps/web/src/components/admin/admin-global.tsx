import { m } from '@repo/i18n/client';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/alert';
import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { EmptyCompact } from '@repo/ui/empty';
import { Panel, PanelContent, PanelDescription, PanelRow, PanelTitle } from '@repo/ui/panel';
import { Skeleton } from '@repo/ui/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminUserTab } from '@/components/admin/admin-user';
import { adminGlobalQuery, adminGlobalStatusQuery, adminGlobalSync, adminUsersQuery } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminProblem, adminSectionLabel } from '@/services/admin/admin.utils';
import IconTriangleAlert from '~icons/lucide/triangle-alert';
import IconUsers from '~icons/lucide/users';
import type { AdminSection } from '@repo/contracts/universal';
import type { ReactNode } from 'react';

interface AdminGlobalProps {
  children: ReactNode
}

export function AdminGlobal({ children }: AdminGlobalProps) {
  const { data: global } = useQuery(adminGlobalQuery());
  const params = { userId: ADMIN.templateId };

  return (
    <>
      <AdminPageHeader description={m.admin_global_hint()} title={m.admin_global_title()} />
      {global && global.state !== 'ready' ? (
        <Alert>
          <IconTriangleAlert className="text-warning" />
          <AlertTitle>{global.state === 'starting' ? m.admin_global_starting() : m.admin_global_missing()}</AlertTitle>
          <AlertDescription>{global.state === 'starting' ? m.admin_global_starting_hint() : m.admin_global_missing_hint()}</AlertDescription>
        </Alert>
      ) : null}
      <nav aria-label={m.admin_global_sections()} className="flex gap-1 border-b">
        <AdminUserTab params={params} to="/admin/users/$userId/settings">{m.settings_title()}</AdminUserTab>
        <AdminUserTab params={params} to="/admin/users/$userId/bots">{m.admin_global_bots()}</AdminUserTab>
        <AdminUserTab params={params} to="/admin/users/$userId/status">{m.admin_global_status()}</AdminUserTab>
      </nav>
      {children}
    </>
  );
}

export function AdminGlobalStatus() {
  const queryClient = useQueryClient();
  const status = useQuery(adminGlobalStatusQuery());
  const { data: users = [] } = useQuery(adminUsersQuery());

  const sync = useMutation({
    mutationFn: adminGlobalSync,
    meta: { success: m.admin_global_sync_started() },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sections'] }),
  });

  if (status.isPending) {
    return <Skeleton className="h-48 w-full max-w-3xl" />;
  }

  if (status.isError) {
    return (
      <EmptyCompact
        description={m.admin_user_unreachable_hint()}
        icon={<IconTriangleAlert />}
        title={m.admin_global_status_failed()}
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => void status.refetch()}
        >
          {m.layout_retry()}
        </Button>
      </EmptyCompact>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{m.admin_global_status_hint()}</p>
        <ButtonLoading
          loading={sync.isPending}
          size="sm"
          variant="outline"
          onClick={() => sync.mutate({})}
        >
          {m.admin_global_sync()}
        </ButtonLoading>
      </div>
      {sync.isError ? <p className="text-xs text-destructive" role="alert">{adminProblem({ error: sync.error, failed: m.admin_global_sync_failed() })}</p> : null}
      {status.data.length === 0 ? (
        <EmptyCompact
          description={m.admin_users_empty_hint()}
          icon={<IconUsers />}
          title={m.admin_users_empty()}
        />
      ) : (
        <Panel>
          {status.data.map((item) => (
            <AdminGlobalStatusRow
              isSignInOff={users.find((user) => user.id === item.id)?.enabled === false}
              key={item.id}
              name={users.find((user) => user.id === item.id)?.name ?? item.id}
              sections={item.sections}
              userId={item.id}
            />
          ))}
        </Panel>
      )}
    </div>
  );
}

interface AdminGlobalStatusRowProps {
  userId: string
  name: string
  isSignInOff: boolean
  sections: AdminSection[]
}

function AdminGlobalStatusRow({ userId, name, isSignInOff, sections }: AdminGlobalStatusRowProps) {
  const overridden = sections.filter((section) => section.mode === 'overridden').map((section) => adminSectionLabel(section.id));
  const failed = sections.filter((section) => section.sync === 'failed');
  const isPending = sections.some((section) => section.sync === 'pending');

  return (
    <PanelRow className="flex-wrap">
      <PanelContent className="min-w-40">
        <PanelTitle className="truncate">{name}</PanelTitle>
        <PanelDescription>
          {overridden.length > 0 ? m.admin_global_status_overridden({ sections: overridden.join(', ') }) : m.admin_global_status_follows()}
        </PanelDescription>
        {isPending && isSignInOff ? <PanelDescription>{m.admin_global_status_waiting_hint()}</PanelDescription> : null}
        {failed.map((section) => (
          <p className="text-xs break-all text-destructive" key={section.id}>
            {m.admin_global_status_error({ section: adminSectionLabel(section.id), error: section.error ?? m.admin_section_failed() })}
          </p>
        ))}
      </PanelContent>
      <div className="flex items-center gap-2">
        {isPending && !isSignInOff ? <Badge variant="warning">{m.admin_global_status_pending()}</Badge> : null}
        {isPending && isSignInOff ? <Badge variant="outline-secondary">{m.admin_global_status_waiting()}</Badge> : null}
        {failed.length > 0 ? <Badge variant="destructive">{m.admin_global_status_failed_badge()}</Badge> : null}
      </div>
      <Button
        asChild
        size="sm"
        variant="outline"
      >
        <Link params={{ userId }} to="/admin/users/$userId/settings">{m.admin_users_open()}</Link>
      </Button>
    </PanelRow>
  );
}
