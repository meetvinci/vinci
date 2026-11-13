import { useRpc } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@repo/ui/empty';
import { Label } from '@repo/ui/label';
import { SettingsDevices } from '@repo/ui/settings/settings-devices';
import { Skeleton } from '@repo/ui/skeleton';
import { StatusDot } from '@repo/ui/status-dot';
import { Switch } from '@repo/ui/switch';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useId, useTransition } from 'react';
import { match } from 'ts-pattern';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminUserLimits } from '@/components/admin/admin-user-limits';
import { useAdminNotice } from '@/hooks/use-admin-notice';
import { useSectionScope } from '@/hooks/use-section-scope';
import { adminUpdateUser, adminUsersQuery } from '@/services/admin/admin.client';
import { adminProblem, adminQueriesStatus, adminStateLabel } from '@/services/admin/admin.utils';
import IconActivity from '~icons/lucide/activity';
import IconChevronRight from '~icons/lucide/chevron-right';
import IconTrash from '~icons/lucide/trash-2';
import type { AdminQueriesStatus } from '@/types/admin.types';
import type { AdminUser as AdminUserData } from '@repo/contracts/universal';
import type { ReactNode } from 'react';

interface AdminUserProps {
  userId: string
  children: ReactNode
}

export function AdminUser({ userId, children }: AdminUserProps) {
  const { data: users } = useSuspenseQuery(adminUsersQuery());
  const user = users.find((item) => item.id === userId);

  if (!user) {
    return null;
  }

  const state = adminStateLabel(user.state);

  return (
    <>
      <AdminPageHeader
        actions={<AdminUserActions user={user} />}
        description={(
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{user.email}</span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1.5">
              <StatusDot label={state.label} variant={state.tone} />
              {state.label}
            </span>
            {user.enabled ? null : <Badge variant="outline-secondary">{m.admin_user_login_off()}</Badge>}
            {user.advanced ? <Badge variant="outline-secondary">{m.admin_user_advanced()}</Badge> : null}
          </span>
        )}
        title={(
          <span className="flex items-center gap-1.5">
            <Link className="font-normal text-muted-foreground hover:text-foreground" to="/admin/users">{m.admin_users_title()}</Link>
            <IconChevronRight aria-hidden className="size-4 text-muted-foreground" />
            <span className="truncate">{user.name}</span>
          </span>
        )}
      />
      <nav aria-label={m.admin_user_sections()} className="flex gap-1 border-b">
        <AdminUserTab params={{ userId }} to="/admin/users/$userId/bots">{m.bots_title()}</AdminUserTab>
        <AdminUserTab params={{ userId }} to="/admin/users/$userId/settings">{m.settings_title()}</AdminUserTab>
        <AdminUserTab params={{ userId }} to="/admin/users/$userId/conversations">{m.admin_conversations_title()}</AdminUserTab>
        <AdminUserTab params={{ userId }} to="/admin/users/$userId/devices">{m.settings_devices()}</AdminUserTab>
      </nav>
      {children}
    </>
  );
}

interface AdminUserTabProps {
  to: '/admin/users/$userId/bots' | '/admin/users/$userId/settings' | '/admin/users/$userId/conversations' | '/admin/users/$userId/devices' | '/admin/users/$userId/status'
  params: { userId: string }
  children: ReactNode
}

export function AdminUserTab({ to, params, children }: AdminUserTabProps) {
  return (
    <Link
      className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
      params={params}
      to={to}
    >
      {children}
    </Link>
  );
}

interface AdminUserActionsProps {
  user: AdminUserData
}

function AdminUserActions({ user }: AdminUserActionsProps) {
  const queryClient = useQueryClient();
  const notice = useAdminNotice();

  const toggle = useMutation({
    mutationFn: adminUpdateUser,
    meta: { success: user.enabled ? m.admin_user_login_turned_off() : m.admin_user_login_turned_on() },
    onSuccess: async ({ access }, { enabled }) => {
      await queryClient.invalidateQueries({ queryKey: adminUsersQuery().queryKey });
      notice({
        access,
        email: user.email,
        change: enabled ? 'add' : 'remove',
      });
    },
  });

  return (
    <>
      <AdminUserAdvanced user={user} />
      {toggle.isError ? <span className="text-xs text-destructive" role="alert">{adminProblem({ error: toggle.error, failed: m.admin_user_update_failed() })}</span> : null}
      <ButtonLoading
        loading={toggle.isPending}
        size="sm"
        variant="outline"
        onClick={() => toggle.mutate({ id: user.id, enabled: !user.enabled })}
      >
        {user.enabled ? m.admin_user_login_turn_off() : m.admin_user_login_turn_on()}
      </ButtonLoading>
      <Button
        asChild
        size="sm"
        variant="outline"
      >
        <Link search={{ user: user.id }} to="/admin/activity">
          <IconActivity />
          {m.admin_activity_for_person()}
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        variant="outline"
      >
        <Link params={{ userId: user.id }} to="/admin/users/$userId/remove">
          <IconTrash />
          {m.admin_user_remove()}
        </Link>
      </Button>
    </>
  );
}

interface AdminUserAdvancedProps {
  user: AdminUserData
}

function AdminUserAdvanced({ user }: AdminUserAdvancedProps) {
  const id = useId();

  const change = useMutation({
    mutationFn: adminUpdateUser,
    meta: {
      success: user.advanced ? m.admin_user_advanced_turned_off() : m.admin_user_advanced_turned_on(),
      error: m.admin_user_advanced_failed(),
      invalidates: [adminUsersQuery().queryKey],
    },
  });

  return (
    <span className="flex items-center gap-2" title={m.admin_user_advanced_hint()}>
      <Switch
        checked={user.advanced}
        disabled={change.isPending}
        id={id}
        onCheckedChange={(advanced) => change.mutate({ id: user.id, advanced })}
      />
      <Label htmlFor={id}>{m.admin_user_advanced()}</Label>
    </span>
  );
}

interface AdminUserDevicesProps {
  userId: string
  revokeId: string | undefined
}

export function AdminUserDevices({ userId, revokeId }: AdminUserDevicesProps) {
  const navigate = useNavigate();
  const scope = useSectionScope();
  const { rpc } = useRpc();
  const devices = useQuery(rpc.devices.list.queryOptions());

  return (
    <AdminUserGate status={adminQueriesStatus([devices])}>
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm text-muted-foreground">{m.admin_user_devices_hint()}</p>
        <SettingsDevices
          canPair={false}
          currentDeviceId={null}
          revokeId={revokeId}
          revokeLink={scope.settings.deviceRevoke}
          onRevokeClose={() => void navigate({
            to: '/admin/users/$userId/devices',
            params: { userId },
            replace: true,
          })}
        />
        <AdminUserLimits />
      </div>
    </AdminUserGate>
  );
}

interface AdminUserGateProps {
  status: AdminQueriesStatus
  children: ReactNode
}

export function AdminUserGate({ status, children }: AdminUserGateProps) {
  return match(status)
    .with('error', () => <AdminUserError />)
    .with('pending', () => <Skeleton className="h-96 w-full" />)
    .with('success', () => children)
    .exhaustive();
}

function AdminUserError() {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.admin_user_unreachable()}</EmptyTitle>
        <EmptyDescription>{m.admin_user_unreachable_hint()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <ButtonLoading
          loading={isRetrying}
          size="sm"
          variant="outline"
          onClick={() => startRetry(() => router.invalidate())}
        >
          {m.layout_retry()}
        </ButtonLoading>
      </EmptyContent>
    </Empty>
  );
}
