import { botModelUsage } from '@repo/client/client';
import { useRpc } from '@repo/client/react';
import { providerAuthType } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { cn } from '@repo/ui/cn';
import { SectionDialog, SectionDialogBody, SectionDialogNav, SectionDialogNavItem, SectionDialogNavTitle } from '@repo/ui/section-dialog';
import { SettingsAppearance } from '@repo/ui/settings/settings-appearance';
import { SettingsDevices } from '@repo/ui/settings/settings-devices';
import { SettingsProviders } from '@repo/ui/settings/settings-providers';
import { SettingsSecrets } from '@repo/ui/settings/settings-secrets';
import { SettingsServer } from '@repo/ui/settings/settings-server';
import { SettingsSources } from '@repo/ui/settings/settings-sources';
import { SettingsThemeCreate } from '@repo/ui/settings/settings-theme-create';
import { Skeleton } from '@repo/ui/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ClientOnly, Link, useHydrated, useNavigate } from '@tanstack/react-router';
import { Suspense, useEffect } from 'react';
import { match } from 'ts-pattern';
import { SettingsChat } from '@/components/settings/settings-chat';
import { SettingsDesktop } from '@/components/settings/settings-desktop';
import { SettingsGeneral } from '@/components/settings/settings-general';
import { SettingsModelSwap } from '@/components/settings/settings-model-swap';
import { SettingsModels } from '@/components/settings/settings-models';
import { SettingsTools } from '@/components/settings/settings-tools';
import { useMutationPending } from '@/hooks/use-mutation-pending';
import { useSectionScope } from '@/hooks/use-section-scope';
import { SETTINGS_ADMIN_AUTH_TYPES, SETTINGS_ADMIN_HIDDEN, SETTINGS_NAV } from '@/services/settings/settings.constants';
import type { SettingsSectionFrame } from '@/types/settings.types';
import type { ConnectionInfo } from '@repo/client/client';
import type { SettingsSection } from '@repo/contracts/universal';

interface SettingsDialogProps {
  variant?: 'dialog' | 'page'
  connection: ConnectionInfo | null
  section: SettingsSection
  view: 'theme' | 'swap' | undefined
  modelKey: string | undefined
  deviceId: string | undefined
  providerId: string | undefined
  sections?: readonly SettingsSection[]
  frame?: SettingsSectionFrame | null
  onClose: () => void
}

export function SettingsDialog({ variant, connection, section, view, modelKey, deviceId, providerId, sections, frame, onClose }: SettingsDialogProps) {
  const { rpc } = useRpc();
  const navigate = useNavigate();
  const scope = useSectionScope();

  const current = SETTINGS_NAV.find((item) => item.id === section) ?? SETTINGS_NAV[0];

  const isBusy = useMutationPending([
    rpc.devices.revoke.mutationKey(),
    rpc.providers.logout.mutationKey(),
    rpc.bots.swapModels.mutationKey(),
  ]);

  return (
    <SectionDialog
      description={m.settings_description()}
      isBusy={isBusy}
      title={m.settings_title()}
      variant={variant}
      onClose={onClose}
    >
      <SettingsDialogNav section={section} sections={sections} />
      <SectionDialogBody
        actions={view ? undefined : frame?.actions}
        description={view ? undefined : current.description()}
        key={`${section}-${view ?? ''}`}
        title={view ? undefined : current.label()}
      >
        {frame?.notice}
        <div
          className={cn('flex flex-col gap-10', frame?.isLocked && 'opacity-60')}
          inert={frame?.isLocked}
          key={frame?.isLocked ? 'locked' : 'open'}
        >
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <SettingsDialogSection
              connection={connection}
              deviceId={deviceId}
              modelKey={modelKey}
              providerId={providerId}
              section={section}
              view={view}
              onBack={() => void navigate(scope.settings.section(section))}
            />
          </Suspense>
        </div>
      </SectionDialogBody>
    </SectionDialog>
  );
}

interface SettingsDialogNavProps {
  section: SettingsSection
  sections: readonly SettingsSection[] | undefined
}

function SettingsDialogNav({ section, sections }: SettingsDialogNavProps) {
  const hydrated = useHydrated();
  const scope = useSectionScope();

  const items = SETTINGS_NAV.filter((item) => !(scope.isAdmin && SETTINGS_ADMIN_HIDDEN.includes(item.id))
    && (!sections || sections.includes(item.id))
    && (item.id !== 'desktop' || (hydrated && Boolean(window.__electrobunSendToHost))));

  return (
    <SectionDialogNav
      activeKey={section}
      footer={scope.isAdmin ? undefined : (
        <>
          <Button
            asChild
            size="xs"
            variant="link-muted"
          >
            <Link to="/lab/avatars">{m.layout_avatar_lab()}</Link>
          </Button>
          <Button
            asChild
            size="xs"
            variant="link-muted"
          >
            <Link to="/lab/chat">{m.layout_lab_chat()}</Link>
          </Button>
        </>
      )}
      header={<SectionDialogNavTitle>{m.settings_title()}</SectionDialogNavTitle>}
      label={m.settings_sections()}
    >
      {items.map((item) => (
        <SectionDialogNavItem isActive={item.id === section} key={item.id}>
          <Link {...scope.settings.section(item.id)} resetScroll={false}>
            <item.icon />
            {item.label()}
          </Link>
        </SectionDialogNavItem>
      ))}
    </SectionDialogNav>
  );
}

interface SettingsDialogSwapProps {
  modelKey: string | undefined
  onBack: () => void
}

function SettingsDialogSwap({ modelKey, onBack }: SettingsDialogSwapProps) {
  const { rpc } = useRpc();
  const { data: bots } = useSuspenseQuery(rpc.bots.list.queryOptions());
  const usage = botModelUsage({ bots }).get(modelKey ?? '');

  useEffect(() => {
    if (!usage) {
      onBack();
    }
  }, [usage, onBack]);

  return usage ? <SettingsModelSwap usage={usage} onClose={onBack} /> : null;
}

interface SettingsDialogSectionProps {
  connection: ConnectionInfo | null
  section: SettingsSection
  view: 'theme' | 'swap' | undefined
  modelKey: string | undefined
  deviceId: string | undefined
  providerId: string | undefined
  onBack: () => void
}

function SettingsDialogSection({ connection, section, view, modelKey, deviceId, providerId, onBack }: SettingsDialogSectionProps) {
  const scope = useSectionScope();

  return match(section)
    .with('general', () => (view === 'theme' ? <ClientOnly><SettingsThemeCreate onBack={onBack} /></ClientOnly> : (
      <>
        <SettingsGeneral />
        {scope.isAdmin ? null : <SettingsAppearance />}
      </>
    )))
    .with('chat', () => <SettingsChat />)
    .with('models', () => (view === 'swap' ? <SettingsDialogSwap modelKey={modelKey} onBack={onBack} /> : (
      <>
        <SettingsProviders
          authTypes={scope.isAdmin ? SETTINGS_ADMIN_AUTH_TYPES : providerAuthType.options}
          signOutId={providerId}
          signOutLink={scope.settings.providerLogout}
          onSignOutClose={onBack}
        />
        <SettingsModels />
      </>
    )))
    .with('tools', () => <SettingsTools />)
    .with('secrets', () => <SettingsSecrets />)
    .with('sources', () => <SettingsSources />)
    .with('server', () => <SettingsServer />)
    .with('devices', () => (
      <SettingsDevices
        canPair={!scope.isAdmin}
        currentDeviceId={connection?.deviceId ?? null}
        revokeId={deviceId}
        revokeLink={scope.settings.deviceRevoke}
        onRevokeClose={onBack}
      />
    ))
    .with('desktop', () => <ClientOnly><SettingsDesktop /></ClientOnly>)
    .exhaustive();
}
