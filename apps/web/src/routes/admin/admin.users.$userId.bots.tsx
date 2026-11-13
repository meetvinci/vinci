import { useRpc } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useMatches, useNavigate, useParams } from '@tanstack/react-router';
import { AdminBotCopy } from '@/components/admin/admin-bot-copy';
import { AdminUserGate } from '@/components/admin/admin-user';
import { BotDialog } from '@/components/bots/bot-dialog';
import { adminQueriesStatus } from '@/services/admin/admin.utils';
import { botDialogView } from '@/services/bot/bot.utils';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/admin/users/$userId/bots')({
  head: () => seoHead({ title: m.bots_title() }),
  loader: async ({ context }) => {
    const { rpc } = context.userRpc;

    await Promise.all([
      context.queryClient.prefetchQuery(rpc.bots.list.queryOptions()),
      context.queryClient.prefetchQuery(rpc.models.list.queryOptions()),
      context.queryClient.prefetchQuery(rpc.models.settings.queryOptions()),
      context.queryClient.prefetchQuery(rpc.providers.list.queryOptions()),
    ]);
  },
  component: AdminUserBotsRoute,
});

function AdminUserBotsRoute() {
  const navigate = useNavigate();
  const routeId = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const params = useParams({ strict: false });
  const view = botDialogView({ path: routeId?.slice(Route.id.length), params });
  const { rpc } = useRpc();
  const { userId } = Route.useParams();
  const bots = useQuery(rpc.bots.list.queryOptions());

  return (
    <AdminUserGate status={adminQueriesStatus([bots])}>
      <AdminBotCopy userId={userId} />
      {view ? (
        <BotDialog
          variant="page"
          view={view}
          onClose={() => void navigate({ to: '/admin/users' })}
        />
      ) : null}
    </AdminUserGate>
  );
}
