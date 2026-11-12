import { m } from '@repo/i18n/client';
import { LayoutNotFound } from '@repo/ui/layout/layout-error';
import { createFileRoute, useMatches, useParams } from '@tanstack/react-router';
import { BotDialog } from '@/components/bots/bot-dialog';
import { useSectionDialogClose } from '@/hooks/use-section-dialog-close';
import { botDialogView } from '@/services/bot/bot.utils';
import { rpc } from '@/services/rpc/rpc.client';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/_chat/bots')({
  head: () => seoHead({ title: m.bots_title() }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(rpc.bots.list.queryOptions()),
      context.queryClient.prefetchQuery(rpc.models.list.queryOptions()),
      context.queryClient.prefetchQuery(rpc.providers.list.queryOptions()),
    ]);

    return { breadcrumb: m.bots_title() };
  },
  component: BotsRoute,
  notFoundComponent: LayoutNotFound,
});

function BotsRoute() {
  const routeId = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const params = useParams({ strict: false });
  const close = useSectionDialogClose();
  const view = botDialogView({ path: routeId?.slice(Route.id.length), params });

  if (!view) {
    return null;
  }

  return <BotDialog view={view} onClose={close} />;
}
