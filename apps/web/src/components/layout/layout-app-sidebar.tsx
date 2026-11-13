import { LayoutBrand } from '@repo/ui/layout/layout-brand';
import * as Sidebar from '@repo/ui/sidebar';
import { Link, useMatch, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { RoomsSidebar, RoomsSidebarActions } from '@/components/rooms/rooms-sidebar';
import BrandsLogo from '~icons/brands/logo';
import { LayoutNavDevice } from './layout-nav-device';
import type { ConnectionInfo } from '@repo/client/client';
import type { ComponentProps } from 'react';

interface LayoutAppSidebarProps extends ComponentProps<typeof Sidebar.Sidebar> {
  connection: ConnectionInfo
}

export function LayoutAppSidebar({ connection, ...props }: LayoutAppSidebarProps) {
  const { isMobile, setOpenMobile } = Sidebar.useSidebar();
  const router = useRouter();
  const isHome = useMatch({ from: '/_chat/rooms/', shouldThrow: false }) !== undefined;

  useEffect(() => {
    if (isMobile && isHome && Object.keys(router.state.location.search).length === 0) {
      setOpenMobile(true);
    }
  }, [isMobile, isHome, router, setOpenMobile]);

  return (
    <Sidebar.Sidebar {...props}>
      <div className="cursor-default electrobun-webkit-app-region-drag">
        <Sidebar.SidebarHeader className="flex-row items-center desktop:h-13">
          <Link className="flex items-center gap-2 overflow-hidden px-2 outline-none group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 md:hidden" to="/rooms">
            <BrandsLogo aria-hidden="true" className="size-5 shrink-0 text-black dark:text-white" />
            <LayoutBrand className="group-data-[collapsible=icon]:sr-only" />
          </Link>
          <RoomsSidebarActions />
        </Sidebar.SidebarHeader>
      </div>
      <Sidebar.SidebarContent>
        <RoomsSidebar />
      </Sidebar.SidebarContent>
      <Sidebar.SidebarFooter className="desktop:group-data-[collapsible=icon]:mb-3"><LayoutNavDevice connection={connection} /></Sidebar.SidebarFooter>
      <Sidebar.SidebarRail />
    </Sidebar.Sidebar>
  );
}
