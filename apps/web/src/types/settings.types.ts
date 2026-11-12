import type { SettingsSection } from '@repo/contracts/universal';
import type { ComponentType, ReactNode } from 'react';

export interface SettingsNavItem {
  id: SettingsSection
  label: () => string
  description: () => string
  icon: ComponentType<{ className?: string }>
}

export interface SettingsDialogState {
  section: SettingsSection
  view: 'theme' | 'swap' | undefined
}

export interface SettingsDialogStateParams {
  isTheme: boolean
  tab: string | undefined
  model: string | undefined
  deviceId: string | undefined
  providerId: string | undefined
}

export interface SettingsSectionFrame {
  actions: ReactNode
  notice: ReactNode
  isLocked: boolean
}

export interface SettingsTeamVisibleParams {
  isTeam: boolean
  isAdvanced: boolean
  section: SettingsSection
}
