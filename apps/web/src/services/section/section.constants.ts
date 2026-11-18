import { linkOptions } from '@tanstack/react-router';
import type { SectionScope } from '@/types/section.types';

export const SECTION_SCOPE_APP: SectionScope = {
  isAdmin: false,
  settings: {
    section: (tab) => linkOptions({
      to: '/settings/$tab',
      params: { tab },
      replace: true,
    }),
    model: (model) => linkOptions({
      to: '/settings/models/$model',
      params: { model },
      replace: true,
    }),
    providerLogout: (providerId) => linkOptions({
      to: '/settings/providers/$providerId/logout',
      params: { providerId },
      replace: true,
    }),
    deviceRevoke: (deviceId) => linkOptions({
      to: '/settings/devices/$deviceId/revoke',
      params: { deviceId },
      replace: true,
    }),
  },
  bots: {
    list: linkOptions({ to: '/bots', replace: true }),
    create: linkOptions({ to: '/bots/create', replace: true }),
    section: (botId, tab) => linkOptions({
      to: '/bots/$botId/$tab',
      params: { botId, tab },
      replace: true,
    }),
    skillsLocal: (botId) => linkOptions({
      to: '/bots/$botId/skills/local',
      params: { botId },
      replace: true,
    }),
    reset: (botId) => linkOptions({
      to: '/bots/$botId/reset',
      params: { botId },
      replace: true,
    }),
    remove: (botId) => linkOptions({
      to: '/bots/$botId/delete',
      params: { botId },
      replace: true,
    }),
    mcpRemove: (botId, server) => linkOptions({ to: '/bots/$botId/mcp/$server/remove', params: { botId, server } }),
    mcpEdit: null,
  },
  rooms: {
    routineEdit: (botId, routineId) => linkOptions({ to: '/bots/$botId/routines/$routineId/edit', params: { botId, routineId } }),
    routineDelete: (botId, routineId) => linkOptions({ to: '/bots/$botId/routines/$routineId/delete', params: { botId, routineId } }),
    todoDelete: (botId, todoId) => linkOptions({
      to: '/bots/$botId/todos/$todoId/delete',
      params: { botId, todoId },
      replace: true,
    }),
  },
};
