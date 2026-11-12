import { rpcContext } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { AdminGlobal } from '@/components/admin/admin-global';
import { AdminUser } from '@/components/admin/admin-user';
import { sectionScopeContext } from '@/context/section';
import { adminRpc, adminUserListQuery } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminSectionScope } from '@/services/admin/admin.utils';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/admin/users/$userId')({
  beforeLoad: ({ params }) => ({ userRpc: adminRpc({ userId: params.userId }) }),
  loader: async ({ context, params }) => {
    if (params.userId === ADMIN.templateId) {
      return { breadcrumb: m.admin_global_title() };
    }

    const { users } = await context.queryClient.ensureQueryData(adminUserListQuery());
    const user = users.find((item) => item.id === params.userId);

    if (!user) {
      throw notFound();
    }

    return { breadcrumb: user.name };
  },
  head: ({ loaderData }) => seoHead({ title: loaderData?.breadcrumb }),
  component: AdminUserRoute,
});

function AdminUserRoute() {
  const { userId } = Route.useParams();
  const { userRpc } = Route.useRouteContext();
  const scope = adminSectionScope(userId);

  return (
    <rpcContext.Provider value={userRpc}>
      <sectionScopeContext.Provider value={scope}>
        {userId === ADMIN.templateId ? (
          <AdminGlobal>
            <Outlet />
          </AdminGlobal>
        ) : (
          <AdminUser key={userId} userId={userId}>
            <Outlet />
          </AdminUser>
        )}
      </sectionScopeContext.Provider>
    </rpcContext.Provider>
  );
}
