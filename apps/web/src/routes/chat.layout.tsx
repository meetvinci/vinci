import { useChatListSync } from '@repo/client/react';
import { useRoomsPresence } from '@repo/client/web';
import { chatSearch } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { RoomsSectionDeleteDialog } from '@repo/ui/rooms/rooms-section-delete-dialog';
import { RoomsSectionDialog } from '@repo/ui/rooms/rooms-section-dialog';
import { createFileRoute, Outlet, redirect, useMatch } from '@tanstack/react-router';
import { LayoutShellDashboard } from '@/components/layout/layout-shell-dashboard';
import { RoomsDetails } from '@/components/rooms/rooms-details';
import { RoomsSearch } from '@/components/rooms/rooms-search';
import { useDesktopUpdateToast } from '@/hooks/use-desktop-update-toast';
import { useLayoutShortcuts } from '@/hooks/use-layout-shortcuts';
import { usePush } from '@/hooks/use-push';
import { useRoomsNotify } from '@/hooks/use-rooms-notify';
import { layoutSidebarsOpen } from '@/services/layout/layout.client';
import { rpc } from '@/services/rpc/rpc.client';
import { seoHead } from '@/services/seo/seo.utils';
import { teamQuery } from '@/services/team/team.client';

export const Route = createFileRoute('/_chat')({
  head: () => seoHead({ title: m.rooms_meta_title() }),
  validateSearch: chatSearch,
  beforeLoad: ({ context }) => {
    if (!context.connection) {
      throw redirect({ to: '/connect' });
    }

    return { connection: context.connection };
  },
  loader: async ({ context }) => {
    const [sidebars] = await Promise.all([
      layoutSidebarsOpen(),
      context.queryClient.ensureQueryData(rpc.conversation.list.queryOptions()),
      context.queryClient.ensureQueryData(rpc.bots.list.queryOptions()),
      context.queryClient.ensureQueryData(rpc.models.list.queryOptions()),
      context.queryClient.ensureQueryData(teamQuery()),
    ]);

    return { sidebars, connection: context.connection };
  },
  component: RoomsLayout,
});

function RoomsLayout() {
  useChatListSync();
  useRoomsNotify();
  usePush();
  useDesktopUpdateToast();
  useRoomsPresence();
  useLayoutShortcuts();
  const { sidebars, connection } = Route.useLoaderData();
  const room = useMatch({ from: '/_chat/rooms/direct/$handle', shouldThrow: false });

  return (
    <LayoutShellDashboard
      aside={<RoomsDetails />}
      asidePathname={room?.pathname}
      connection={connection}
      sidebars={sidebars}
    >
      <Outlet />
      <RoomsSearch />
      <RoomsSectionDialog />
      <RoomsSectionDeleteDialog />
    </LayoutShellDashboard>
  );
}
