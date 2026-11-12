import { GIF_PROVIDER_LABELS, ROOMS_SEND_MODES } from '@repo/client/client';
import { useChatDefaults, useChatHideVerbose, useRpc } from '@repo/client/react';
import { usePreferences } from '@repo/client/web';
import { conversationWhenBusy, gifProvider, preferencesEnterAction } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { Label } from '@repo/ui/label';
import { PanelContent, PanelDescription, PanelRow, PanelTitle } from '@repo/ui/panel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { SettingsGroup } from '@repo/ui/settings/settings-group';
import { Switch } from '@repo/ui/switch';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { SettingsManaged } from '@/components/settings/settings-managed';
import { useSectionScope } from '@/hooks/use-section-scope';
import { useTeam } from '@/hooks/use-team';

const SETTINGS_ENTER_KEYS = [
  { device: 'desktop', label: m.settings_chat_enter_desktop },
  { device: 'mobile', label: m.settings_chat_enter_mobile },
] as const;

const SETTINGS_ENTER_ACTIONS = { send: m.settings_chat_enter_send, newline: m.settings_chat_enter_newline };

export function SettingsChat() {
  const scope = useSectionScope();
  const team = useTeam();

  return (
    <>
      {scope.isAdmin ? null : <SettingsChatKeys />}
      {team.isAdvanced ? (
        <SettingsManaged section="chat">
          <SettingsChatWorkspace />
        </SettingsManaged>
      ) : null}
    </>
  );
}

function SettingsChatKeys() {
  const { preferences, save } = usePreferences();

  return (
    <SettingsGroup title={m.settings_chat()}>
      {SETTINGS_ENTER_KEYS.map((row) => (
        <PanelRow key={row.device}>
          <PanelContent>
            <PanelTitle>{row.label()}</PanelTitle>
          </PanelContent>
          <Select
            value={preferences.enterKey[row.device]}
            onValueChange={(value) => save({ ...preferences, enterKey: { ...preferences.enterKey, [row.device]: preferencesEnterAction.parse(value) } })}
          >
            <SelectTrigger aria-label={row.label()} className="w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {preferencesEnterAction.options.map((action) => <SelectItem key={action} value={action}>{SETTINGS_ENTER_ACTIONS[action]()}</SelectItem>)}
            </SelectContent>
          </Select>
        </PanelRow>
      ))}
    </SettingsGroup>
  );
}

function SettingsChatWorkspace() {
  const { rpc } = useRpc();
  const { data: settings } = useSuspenseQuery(rpc.conversation.settings.queryOptions());
  const configure = useChatDefaults();
  const verbose = useChatHideVerbose();
  const verboseId = useId();

  return (
    <SettingsGroup title={m.settings_chat_workspace()}>
      <PanelRow>
        <PanelContent>
          <PanelTitle>{m.rooms_send_mode()}</PanelTitle>
        </PanelContent>
        <Select
          disabled={configure.isPending}
          value={settings.whenBusy}
          onValueChange={(value) => configure.configure({ whenBusy: conversationWhenBusy.parse(value) })}
        >
          <SelectTrigger aria-label={m.rooms_send_mode()} className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {conversationWhenBusy.options.map((mode) => <SelectItem key={mode} value={mode}>{ROOMS_SEND_MODES[mode]()}</SelectItem>)}
          </SelectContent>
        </Select>
      </PanelRow>
      <PanelRow>
        <PanelContent>
          <Label htmlFor={verboseId}>{m.settings_general_verbose()}</Label>
        </PanelContent>
        <Switch
          checked={verbose.hideVerbose}
          disabled={verbose.isPending}
          id={verboseId}
          onCheckedChange={verbose.setHideVerbose}
        />
      </PanelRow>
      <PanelRow>
        <PanelContent>
          <PanelTitle>{m.settings_gifs()}</PanelTitle>
          <PanelDescription>{m.settings_gifs_credit()}</PanelDescription>
        </PanelContent>
        <Select
          disabled={configure.isPending}
          value={settings.gifProvider}
          onValueChange={(value) => configure.configure({ gifProvider: gifProvider.parse(value) })}
        >
          <SelectTrigger aria-label={m.settings_gifs()} className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {gifProvider.options.map((provider) => <SelectItem key={provider} value={provider}>{GIF_PROVIDER_LABELS[provider]()}</SelectItem>)}
          </SelectContent>
        </Select>
      </PanelRow>
    </SettingsGroup>
  );
}
