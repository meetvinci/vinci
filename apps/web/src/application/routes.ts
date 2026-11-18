import { index, layout, rootRoute, route } from '@tanstack/virtual-file-routes';

export const routes = rootRoute('root.tsx', [
  index('index.tsx'),
  route('/connect', 'connect/connect.tsx'),

  layout('chat', 'chat.layout.tsx', [
    route('/rooms', [
      index('rooms/rooms.index.tsx'),
      route('/direct/$handle', 'rooms/rooms.direct.$handle.tsx', [
        route('/reset', 'rooms/rooms.direct.$handle.reset.tsx'),
        route('/with/$peer/$conversationId', 'rooms/rooms.direct.$handle.with.$peer.tsx'),
        route('/todos', 'rooms/rooms.direct.$handle.todos.tsx', [
          route('/$todoId/delete', 'rooms/rooms.direct.$handle.todos.$todoId.delete.tsx'),
        ]),
        route('/routines', 'rooms/rooms.direct.$handle.routines.tsx'),
        route('/media', 'rooms/rooms.direct.$handle.media.tsx', [
          route('/$attachmentId', 'rooms/rooms.direct.$handle.media.$attachmentId.tsx'),
        ]),
        route('/activity', 'rooms/rooms.direct.$handle.activity.tsx', [
          route('/$runId', 'rooms/rooms.direct.$handle.activity.$runId.tsx'),
        ]),
      ]),
    ]),
    route('/bots', 'bots/bots.tsx', [
      index('bots/bots.index.tsx'),
      route('/create', 'bots/bots.create.tsx'),
      route('/$botId', 'bots/bots.$botId.tsx', [
        index('bots/bots.$botId.index.tsx'),
        route('/delete', 'bots/bots.$botId.delete.tsx'),
        route('/reset', 'bots/bots.$botId.reset.tsx'),
        route('/routines/$routineId/edit', 'bots/bots.$botId.routines.$routineId.edit.tsx'),
        route('/routines/$routineId/delete', 'bots/bots.$botId.routines.$routineId.delete.tsx'),
        route('/todos/$todoId/delete', 'bots/bots.$botId.todos.$todoId.delete.tsx'),
        route('/skills/local', 'bots/bots.$botId.skills.local.tsx'),
        route('/mcp/$server/remove', 'bots/bots.$botId.mcp.$server.remove.tsx'),
        route('/$tab', 'bots/bots.$botId.$tab.tsx'),
      ]),
    ]),
    route('/artifacts', 'artifacts/artifacts.tsx', [
      index('artifacts/artifacts.index.tsx'),
      route('/$botId/$conversationId/$artifactId', 'artifacts/artifacts.$botId.$conversationId.$artifactId.tsx'),
    ]),
    route('/settings', 'settings/settings.tsx', [
      index('settings/settings.index.tsx'),
      route('/themes/create', 'settings/settings.themes.create.tsx'),
      route('/devices/$deviceId/revoke', 'settings/settings.devices.$deviceId.revoke.tsx'),
      route('/providers/$providerId/logout', 'settings/settings.providers.$providerId.logout.tsx'),
      route('/models/$model', 'settings/settings.models.$model.tsx'),
      route('/$tab', 'settings/settings.$tab.tsx'),
    ]),
  ]),
  route('/admin', 'admin/admin.tsx', [
    index('admin/admin.index.tsx'),
    route('/activity', 'admin/admin.activity.tsx'),
    route('/admins', 'admin/admin.admins.tsx', [
      route('/$email/remove', 'admin/admin.admins.$email.remove.tsx'),
    ]),
    route('/users', 'admin/admin.users.tsx', [
      route('/create', 'admin/admin.users.create.tsx'),
    ]),
    route('/users/$userId', 'admin/admin.users.$userId.tsx', [
      index('admin/admin.users.$userId.index.tsx'),
      route('/remove', 'admin/admin.users.$userId.remove.tsx'),
      route('/status', 'admin/admin.users.$userId.status.tsx'),
      route('/conversations', 'admin/admin.users.$userId.conversations.tsx', [
        route('/$botId', 'admin/admin.users.$userId.conversations.$botId.tsx'),
      ]),
      route('/devices', 'admin/admin.users.$userId.devices.tsx', [
        route('/$deviceId/revoke', 'admin/admin.users.$userId.devices.$deviceId.revoke.tsx'),
      ]),
      route('/settings', 'admin/admin.users.$userId.settings.tsx', [
        index('admin/admin.users.$userId.settings.index.tsx'),
        route('/providers/$providerId/logout', 'admin/admin.users.$userId.settings.providers.$providerId.logout.tsx'),
        route('/models/$model', 'admin/admin.users.$userId.settings.models.$model.tsx'),
        route('/$tab', 'admin/admin.users.$userId.settings.$tab.tsx'),
      ]),
      route('/bots', 'admin/admin.users.$userId.bots.tsx', [
        index('admin/admin.users.$userId.bots.index.tsx'),
        route('/create', 'admin/admin.users.$userId.bots.create.tsx'),
        route('/$botId', 'admin/admin.users.$userId.bots.$botId.tsx', [
          index('admin/admin.users.$userId.bots.$botId.index.tsx'),
          route('/delete', 'admin/admin.users.$userId.bots.$botId.delete.tsx'),
          route('/reset', 'admin/admin.users.$userId.bots.$botId.reset.tsx'),
          route('/skills/local', 'admin/admin.users.$userId.bots.$botId.skills.local.tsx'),
          route('/mcp/edit', 'admin/admin.users.$userId.bots.$botId.mcp.edit.tsx'),
          route('/mcp/$server/remove', 'admin/admin.users.$userId.bots.$botId.mcp.$server.remove.tsx'),
          route('/$tab', 'admin/admin.users.$userId.bots.$botId.$tab.tsx'),
        ]),
      ]),
    ]),
  ]),
  route('/lab/avatars', 'lab/lab.avatars.tsx'),
  route('/lab/chat', 'lab/lab.chat.tsx'),
  route('/img/favicon/site.webmanifest', 'handlers/handler.webmanifest.ts'),
]);
