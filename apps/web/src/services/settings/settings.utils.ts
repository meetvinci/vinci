import { settingsSection } from '@repo/contracts/universal';
import { match, P } from 'ts-pattern';
import type { SettingsDialogState, SettingsDialogStateParams } from '@/types/settings.types';

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
