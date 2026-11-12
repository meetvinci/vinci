import { rpcContext } from '@repo/client/react';
import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { AdminUser } from '@/components/admin/admin-user';
import { sectionScopeContext } from '@/context/section';
import { adminRpc, adminUsersQuery } from '@/services/admin/admin.client';
import { adminSectionScope } from '@/services/admin/admin.utils';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/admin/users/$userId')({
  beforeLoad: ({ params }) => ({ userRpc: adminRpc({ userId: params.userId }) }),
  loader: async ({ context, params }) => {
    const users = await context.queryClient.ensureQueryData(adminUsersQuery());
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
        <AdminUser key={userId} userId={userId}>
          <Outlet />
        </AdminUser>
      </sectionScopeContext.Provider>
    </rpcContext.Provider>
  );
}
