import { useNotificationSettings } from '@repo/client/react';
import { notificationPlatform } from '@repo/contracts/universal';
import { locales, m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { Label } from '@repo/ui/label';
import { PanelContent, PanelDescription, PanelRow, PanelTitle } from '@repo/ui/panel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { SettingsGroup } from '@repo/ui/settings/settings-group';
import { ClientOnly } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { match } from 'ts-pattern';
import { SettingsPassword } from '@/components/settings/settings-password';
import { useTeam } from '@/hooks/use-team';
import { localeChoice, localeChoose, localeSystem } from '@/services/locale/locale.client';
import { LOCALE_FLAGS } from '@/services/locale/locale.constants';
import { pushEnable, pushState } from '@/services/push/push.client';
import type { NotificationPlatform } from '@repo/contracts/universal';
import type { Locale } from '@repo/i18n/client';

const SETTINGS_NOTIFY_PREFER = {
  phone: m.settings_notify_prefer_phone,
  computer: m.settings_notify_prefer_computer,
} satisfies Record<NotificationPlatform, () => string>;

function SettingsGeneralLanguage() {
  const id = useId();
  const languageName = (locale: Locale) => m.settings_language_name({}, { locale });

  return (
    <PanelRow>
      <PanelContent>
        <Label htmlFor={id}>{m.settings_language()}</Label>
      </PanelContent>
      <Select
        value={localeChoice()}
        onValueChange={(value) => {
          const choice = value === 'system' ? value : locales.find((locale) => locale === value);

          if (choice) {
            localeChoose({ choice });
          }
        }}
      >
        <SelectTrigger className="w-48" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{m.settings_language_system({ language: languageName(localeSystem()) })}</SelectItem>
          {locales.map((locale) => {
            const Flag = LOCALE_FLAGS[locale];

            return (
              <SelectItem
                key={locale}
                lang={locale}
                textValue={languageName(locale)}
                value={locale}
              >
                <span className="flex items-center gap-2">
                  <Flag aria-hidden="true" className="size-4" />
                  {languageName(locale)}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </PanelRow>
  );
}

function SettingsGeneralNotifications() {
  const id = useId();
  const [state, setState] = useState(pushState);

  const description = match(state)
    .with({ status: 'on', background: true }, () => m.settings_general_notifications_background())
    .with({ status: 'on' }, () => m.settings_general_notifications_open_only())
    .with({ status: 'off' }, () => m.settings_general_notifications_off())
    .with({ status: 'blocked' }, () => m.settings_general_notifications_blocked())
    .with({ status: 'install' }, () => m.settings_general_notifications_install())
    .with({ status: 'unsupported' }, () => m.settings_general_notifications_unsupported())
    .with({ status: 'desktop' }, () => null)
    .exhaustive();

  return (
    <PanelRow>
      <PanelContent>
        <Label htmlFor={id}>{m.settings_general_notifications()}</Label>
        {description ? <PanelDescription>{description}</PanelDescription> : null}
      </PanelContent>
      {state.status === 'off' || state.status === 'on' || state.status === 'desktop' ? (
        <Button
          disabled={state.status !== 'off'}
          id={id}
          size="sm"
          variant="outline"
          onClick={() => void pushEnable().then(setState, () => setState(pushState()))}
        >
          {state.status === 'off' ? m.settings_general_notifications_enable() : m.settings_general_notifications_on()}
        </Button>
      ) : null}
    </PanelRow>
  );
}

export function SettingsGeneral() {
  const notify = useNotificationSettings();
  const team = useTeam();

  return (
    <SettingsGroup title={m.settings_general()}>
      <ClientOnly>
        <SettingsGeneralLanguage />
        <SettingsGeneralNotifications />
      </ClientOnly>
      <PanelRow>
        <PanelContent>
          <PanelTitle>{m.settings_notify_prefer()}</PanelTitle>
        </PanelContent>
        <Select
          disabled={notify.isPending || !notify.prefer}
          value={notify.prefer ?? ''}
          onValueChange={(value) => notify.setPrefer(notificationPlatform.parse(value))}
        >
          <SelectTrigger aria-label={m.settings_notify_prefer()} className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {notificationPlatform.options.map((platform) => <SelectItem key={platform} value={platform}>{SETTINGS_NOTIFY_PREFER[platform]()}</SelectItem>)}
          </SelectContent>
        </Select>
      </PanelRow>
      {team.hasPassword ? <SettingsPassword /> : null}
    </SettingsGroup>
  );
}
