import { m } from '@repo/i18n/client';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AdminAdmins } from '@/components/admin/admin-admins';
import { adminAdminsQuery } from '@/services/admin/admin.client';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/admin/admins')({
  head: () => seoHead({ title: m.admin_admins_title() }),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminAdminsQuery()),
  component: AdminAdminsRoute,
});

function AdminAdminsRoute() {
  return (
    <>
      <AdminAdmins />
      <Outlet />
    </>
  );
}
