import { m } from '@repo/i18n/client';
import { createFileRoute, Outlet, useParams } from '@tanstack/react-router';
import { AdminConversations } from '@/components/admin/admin-conversations';
import { ADMIN } from '@/services/admin/admin.constants';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/admin/users/$userId/conversations')({
  head: () => seoHead({ title: m.admin_conversations_title() }),
  loader: async ({ context, params }) => {
    if (params.userId === ADMIN.templateId) {
      return;
    }

    const { rpc } = context.userRpc;
    const readOnce = { staleTime: Number.POSITIVE_INFINITY, refetchOnWindowFocus: false, refetchOnReconnect: false };

    const reads = [
      rpc.conversation.list,
      rpc.conversation.history,
      rpc.conversation.search,
      rpc.conversation.reactions,
      rpc.conversation.questions,
      rpc.tools.pending,
      rpc.artifacts.get,
      rpc.artifacts.versions,
    ];

    reads.forEach((procedure) => context.queryClient.setQueryDefaults(procedure.key(), readOnce));

    await Promise.all([
      context.queryClient.prefetchQuery(rpc.conversation.list.queryOptions()),
      context.queryClient.prefetchQuery(rpc.bots.list.queryOptions()),
    ]);
  },
  component: AdminUserConversationsRoute,
});

function AdminUserConversationsRoute() {
  const { userId } = Route.useParams();
  const { botId } = useParams({ strict: false });

  return (
    <AdminConversations botId={botId} userId={userId}>
      <Outlet />
    </AdminConversations>
  );
}
