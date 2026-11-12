import { ORPCError } from '@orpc/client';
import { m } from '@repo/i18n/client';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/alert';
import { Button } from '@repo/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@repo/ui/empty';
import { LayoutError } from '@repo/ui/layout/layout-error';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { adminNoticeContext } from '@/context/admin';
import IconTriangleAlert from '~icons/lucide/triangle-alert';
import type { AdminNotice } from '@/types/admin.types';
import type { ErrorComponentProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';

interface AdminLayoutProps {
  email: string
  children: ReactNode
}

export function AdminLayout({ email, children }: AdminLayoutProps) {
  const [notice, setNotice] = useState<AdminNotice | null>(null);

  return (
    <adminNoticeContext.Provider value={setNotice}>
      <div className="flex min-h-svh flex-col bg-background">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-3 md:px-6">
          <p className="text-base font-semibold tracking-tight">{m.admin_title()}</p>
          <nav aria-label={m.admin_nav()} className="flex items-center gap-1">
            <AdminLayoutNavLink to="/admin/users">{m.admin_users_title()}</AdminLayoutNavLink>
            <AdminLayoutNavLink to="/admin/admins">{m.admin_admins_title()}</AdminLayoutNavLink>
          </nav>
          <p className="ml-auto truncate text-sm text-muted-foreground">{m.admin_signed_in_as({ email })}</p>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
          {notice ? <AdminLayoutNotice notice={notice} onDismiss={() => setNotice(null)} /> : null}
          {children}
        </main>
      </div>
    </adminNoticeContext.Provider>
  );
}

interface AdminLayoutNavLinkProps {
  to: '/admin/users' | '/admin/admins'
  children: ReactNode
}

function AdminLayoutNavLink({ to, children }: AdminLayoutNavLinkProps) {
  return (
    <Link
      className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
      to={to}
    >
      {children}
    </Link>
  );
}

interface AdminLayoutNoticeProps {
  notice: AdminNotice
  onDismiss: () => void
}

function AdminLayoutNotice({ notice, onDismiss }: AdminLayoutNoticeProps) {
  return (
    <Alert>
      <IconTriangleAlert className="text-warning" />
      <AlertTitle>{m.admin_access_manual_title()}</AlertTitle>
      <AlertDescription>
        <p>{notice.change === 'add' ? m.admin_access_manual_add({ email: notice.email }) : m.admin_access_manual_remove({ email: notice.email })}</p>
        <Button
          size="xs"
          variant="outline"
          onClick={onDismiss}
        >{m.admin_access_manual_done()}</Button>
      </AlertDescription>
    </Alert>
  );
}

interface AdminLayoutErrorProps {
  error: ErrorComponentProps['error']
}

export function AdminLayoutError({ error }: AdminLayoutErrorProps) {
  if (error instanceof ORPCError && (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED')) {
    return (
      <main className="flex h-svh items-center justify-center">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{error.code === 'FORBIDDEN' ? m.admin_forbidden() : m.admin_signed_out()}</EmptyTitle>
            <EmptyDescription>{m.admin_forbidden_hint()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  return (
    <main className="flex h-svh">
      <LayoutError error={error} />
    </main>
  );
}
