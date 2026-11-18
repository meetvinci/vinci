import type { BotSection, SettingsSection } from '@repo/contracts/universal';
import type { LinkOptions } from '@tanstack/react-router';

export interface SectionSettingsLinks {
  section: (tab: SettingsSection) => LinkOptions
  model: (model: string) => LinkOptions
  providerLogout: (providerId: string) => LinkOptions
  deviceRevoke: (deviceId: string) => LinkOptions
}

export interface SectionBotLinks {
  list: LinkOptions
  create: LinkOptions
  section: (botId: string, tab: BotSection) => LinkOptions
  skillsLocal: (botId: string) => LinkOptions
  reset: (botId: string) => LinkOptions
  remove: (botId: string) => LinkOptions
  mcpRemove: (botId: string, server: string) => LinkOptions
  mcpEdit: ((botId: string) => LinkOptions) | null
}

export interface SectionRoomLinks {
  routineEdit: (botId: string, routineId: string) => LinkOptions
  routineDelete: (botId: string, routineId: string) => LinkOptions
  todoDelete: (botId: string, todoId: string) => LinkOptions
}

export interface SectionScope {
  isAdmin: boolean
  settings: SectionSettingsLinks
  bots: SectionBotLinks
  rooms: SectionRoomLinks | null
}
