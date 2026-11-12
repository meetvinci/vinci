import { m } from '@repo/i18n/client';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AdminUsers } from '@/components/admin/admin-users';
import { adminUserListQuery } from '@/services/admin/admin.client';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/admin/users')({
  head: () => seoHead({ title: m.admin_users_title() }),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminUserListQuery()),
  component: AdminUsersRoute,
});

function AdminUsersRoute() {
  return (
    <>
      <AdminUsers />
      <Outlet />
    </>
  );
}
