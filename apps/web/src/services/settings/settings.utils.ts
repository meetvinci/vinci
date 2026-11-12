import { settingsSection } from '@repo/contracts/universal';
import { match, P } from 'ts-pattern';
import { SETTINGS_TEAM_ADVANCED, SETTINGS_TEAM_HIDDEN } from '@/services/settings/settings.constants';
import type { SettingsDialogState, SettingsDialogStateParams, SettingsTeamVisibleParams } from '@/types/settings.types';

export function settingsDialogState({ isTheme, tab, model, deviceId, providerId }: SettingsDialogStateParams): SettingsDialogState | null {
  return match({
    isTheme,
    model,
    deviceId,
    providerId,
    tab: settingsSection.safeParse(tab),
  })
    .returnType<SettingsDialogState | null>()
    .with({ isTheme: true }, () => ({ section: 'general', view: 'theme' }))
    .with({ model: P.string }, () => ({ section: 'models', view: 'swap' }))
    .with({ deviceId: P.string }, () => ({ section: 'devices', view: undefined }))
    .with({ providerId: P.string }, () => ({ section: 'models', view: undefined }))
    .with({ tab: { success: true } }, ({ tab: parsed }) => ({ section: parsed.data, view: undefined }))
    .otherwise(() => null);
}

export function settingsIsTeamVisible({ isTeam, isAdvanced, section }: SettingsTeamVisibleParams): boolean {
  return !isTeam || !(SETTINGS_TEAM_HIDDEN.includes(section) || (!isAdvanced && SETTINGS_TEAM_ADVANCED.includes(section)));
}
