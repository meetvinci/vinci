import { env } from '@repo/env/client';
import { getLocale, locales, m } from '@repo/i18n/client';
import * as DropdownMenu from '@repo/ui/dropdown-menu';
import { LAYOUT_MENU } from '@repo/ui/layout.constants';
import * as Sidebar from '@repo/ui/sidebar';
import { StatusDot } from '@repo/ui/status-dot';
import { useQuery } from '@tanstack/react-query';
import { Link, useHydrated } from '@tanstack/react-router';
import { match } from 'ts-pattern';
import { connectionForget } from '@/services/connection/connection.client';
import { localeChoice, localeChoose, localeSystem } from '@/services/locale/locale.client';
import { LOCALE_FLAGS } from '@/services/locale/locale.constants';
import { rpc } from '@/services/rpc/rpc.client';
import { teamQuery } from '@/services/team/team.client';
import BrandsLogo from '~icons/brands/logo';
import LucideChevronsUpDown from '~icons/lucide/chevrons-up-down';
import IconLanguages from '~icons/lucide/languages';
import IconLogOut from '~icons/lucide/log-out';
import IconPower from '~icons/lucide/power';
import IconShield from '~icons/lucide/shield';
import type { ConnectionInfo } from '@repo/client/client';
import type { Locale } from '@repo/i18n/client';

function LayoutNavDeviceLanguage() {
  const CurrentFlag = LOCALE_FLAGS[getLocale()];
  const languageName = (locale: Locale) => m.settings_language_name({}, { locale });

  return (
    <DropdownMenu.DropdownMenuSub>
      <DropdownMenu.DropdownMenuSubTrigger>
        <CurrentFlag aria-hidden="true" className="size-4" />
        <span className="flex-1">{m.settings_language()}</span>
      </DropdownMenu.DropdownMenuSubTrigger>
      <DropdownMenu.DropdownMenuPortal>
        <DropdownMenu.DropdownMenuSubContent>
          <DropdownMenu.DropdownMenuRadioGroup
            value={localeChoice()}
            onValueChange={(value) => {
              const choice = value === 'system' ? value : locales.find((locale) => locale === value);

              if (choice) {
                localeChoose({ choice });
              }
            }}
          >
            <DropdownMenu.DropdownMenuRadioItem value="system">
              <IconLanguages aria-hidden="true" className="size-4" />
              {m.settings_language_system({ language: languageName(localeSystem()) })}
            </DropdownMenu.DropdownMenuRadioItem>
            {locales.map((locale) => {
              const Flag = LOCALE_FLAGS[locale];

              return (
                <DropdownMenu.DropdownMenuRadioItem
                  key={locale}
                  lang={locale}
                  value={locale}
                >
                  <Flag aria-hidden="true" className="size-4" />
                  {languageName(locale)}
                </DropdownMenu.DropdownMenuRadioItem>
              );
            })}
          </DropdownMenu.DropdownMenuRadioGroup>
        </DropdownMenu.DropdownMenuSubContent>
      </DropdownMenu.DropdownMenuPortal>
    </DropdownMenu.DropdownMenuSub>
  );
}

interface LayoutNavDeviceProps {
  connection: ConnectionInfo
}

export function LayoutNavDevice({ connection }: LayoutNavDeviceProps) {
  const { isMobile } = Sidebar.useSidebar();
  const hydrated = useHydrated();
  const server = useQuery(rpc.server.info.queryOptions());
  const { data: team } = useQuery(teamQuery());

  const status = match(server)
    .with({ isError: true }, () => 'destructive' as const)
    .with({ isSuccess: true }, () => 'success' as const)
    .otherwise(() => 'default' as const);

  async function disconnect() {
    await rpc.devices.revoke.call({ id: connection.deviceId }).catch(() => undefined);
    await connectionForget();
    location.assign('/connect');
  }

  return (
    <Sidebar.SidebarMenu>
      <Sidebar.SidebarMenuItem>
        <DropdownMenu.DropdownMenu>
          <DropdownMenu.DropdownMenuTrigger asChild>
            <Sidebar.SidebarMenuButton size="lg">
              <span className="relative flex size-8 shrink-0 items-center justify-center">
                <BrandsLogo aria-hidden="true" className="size-5" />
                <span className="absolute -right-0.5 -bottom-0.5 flex rounded-full bg-sidebar p-0.5">
                  <StatusDot label={server.isError ? m.layout_unreachable() : m.layout_connected()} variant={status} />
                </span>
              </span>
              <div className="grid flex-1 text-left text-sm/tight group-data-[collapsible=icon]:sr-only">
                <span className="truncate font-semibold">{team ? team.name ?? team.email : env.VITE_APP_NAME}</span>
              </div>
              <LucideChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </Sidebar.SidebarMenuButton>
          </DropdownMenu.DropdownMenuTrigger>
          <DropdownMenu.DropdownMenuContent
            align="end"
            className="w-[--radix-dropdown-menu-trigger-width] max-w-56 min-w-32"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenu.DropdownMenuGroup>
              {LAYOUT_MENU.map((item) => (
                <DropdownMenu.DropdownMenuItem asChild key={item.link}>
                  <Link to={item.link}>
                    <item.icon className="size-4" />
                    <span className="flex-1">{item.label()}</span>
                  </Link>
                </DropdownMenu.DropdownMenuItem>
              ))}
              {team?.isAdmin ? (
                <DropdownMenu.DropdownMenuItem asChild>
                  <a href="/admin">
                    <IconShield className="size-4" />
                    <span className="flex-1">{m.layout_admin_panel()}</span>
                  </a>
                </DropdownMenu.DropdownMenuItem>
              ) : null}
            </DropdownMenu.DropdownMenuGroup>
            <DropdownMenu.DropdownMenuSeparator />
            <LayoutNavDeviceLanguage />
            <DropdownMenu.DropdownMenuSeparator />
            <DropdownMenu.DropdownMenuItem onSelect={() => void disconnect()}>
              <IconLogOut className="size-4" />
              <span className="flex-1">{m.layout_disconnect()}</span>
            </DropdownMenu.DropdownMenuItem>
            {hydrated && window.__electrobunSendToHost ? (
              <DropdownMenu.DropdownMenuItem onSelect={() => window.__electrobunSendToHost?.({ quit: true })}>
                <IconPower className="size-4" />
                <span className="flex-1">{m.desktop_tray_quit({ name: env.VITE_APP_NAME })}</span>
              </DropdownMenu.DropdownMenuItem>
            ) : null}
          </DropdownMenu.DropdownMenuContent>
        </DropdownMenu.DropdownMenu>
      </Sidebar.SidebarMenuItem>
    </Sidebar.SidebarMenu>
  );
}
