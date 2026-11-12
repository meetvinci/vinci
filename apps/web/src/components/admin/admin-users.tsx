import { m } from '@repo/i18n/client';
import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { EmptyCompact } from '@repo/ui/empty';
import { Panel, PanelContent, PanelDescription, PanelRow, PanelTitle } from '@repo/ui/panel';
import { StatusDot } from '@repo/ui/status-dot';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AdminAccess, AdminAccessNotice } from '@/components/admin/admin-access';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { adminUserListQuery } from '@/services/admin/admin.client';
import { adminStateLabel } from '@/services/admin/admin.utils';
import IconPlus from '~icons/lucide/plus';
import IconUsers from '~icons/lucide/users';
import type { AdminUserList } from '@repo/contracts/universal';

export function AdminUsers() {
  const { data: { users, accessMode, accessDomains } } = useSuspenseQuery(adminUserListQuery());

  return (
    <>
      <AdminPageHeader
        actions={(
          <Button asChild size="sm">
            <Link to="/admin/users/create">
              <IconPlus />
              {m.admin_users_add()}
            </Link>
          </Button>
        )}
        description={m.admin_users_hint()}
        title={m.admin_users_title()}
      />
      <AdminAccessNotice domains={accessDomains} isUnknown={accessMode === 'unknown' || users.some((user) => user.access === 'unknown')} />
      {users.length === 0 ? (
        <EmptyCompact
          description={m.admin_users_empty_hint()}
          icon={<IconUsers />}
          title={m.admin_users_empty()}
        >
          <Button
            asChild
            size="sm"
            variant="outline"
          >
            <Link to="/admin/users/create">{m.admin_users_add()}</Link>
          </Button>
        </EmptyCompact>
      ) : (
        <Panel>
          {users.map((user) => <AdminUsersRow key={user.id} user={user} />)}
        </Panel>
      )}
    </>
  );
}

interface AdminUsersRowProps {
  user: AdminUserList['users'][number]
}

function AdminUsersRow({ user }: AdminUsersRowProps) {
  const state = adminStateLabel(user.state);

  return (
    <PanelRow className="flex-wrap">
      <PanelContent className="min-w-40">
        <PanelTitle className="truncate">{user.name}</PanelTitle>
        <PanelDescription className="truncate">{user.email}</PanelDescription>
      </PanelContent>
      <div className="flex items-center gap-2">
        {user.enabled ? null : <Badge variant="outline-secondary">{m.admin_user_login_off()}</Badge>}
        <AdminAccess access={user.access} isEnabled={user.enabled} />
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot label={state.label} variant={state.tone} />
          {state.label}
        </span>
      </div>
      <Button
        asChild
        size="sm"
        variant="outline"
      >
        <Link params={{ userId: user.id }} to="/admin/users/$userId">{m.admin_users_open()}</Link>
      </Button>
    </PanelRow>
  );
}
