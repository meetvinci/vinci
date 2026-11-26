import { m } from '@repo/i18n/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AdminLayout, AdminLayoutError } from '@/components/admin/admin-layout';
import { adminMeQuery } from '@/services/admin/admin.client';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/admin')({
  ssr: false,
  head: () => seoHead({ title: m.admin_title() }),
  beforeLoad: ({ context }) => ({ queryClient: context.adminQueryClient }),
  loader: async ({ context }) => ({ me: await context.queryClient.ensureQueryData(adminMeQuery()) }),
  component: AdminRoute,
  errorComponent: AdminLayoutError,
});

function AdminRoute() {
  const { queryClient } = Route.useRouteContext();
  const { me } = Route.useLoaderData();

  return (
    <QueryClientProvider client={queryClient}>
      <AdminLayout email={me.email} hasPassword={me.hasPassword}>
        <Outlet />
      </AdminLayout>
    </QueryClientProvider>
  );
}
