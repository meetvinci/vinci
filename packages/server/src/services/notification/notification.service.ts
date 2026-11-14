import { notificationActionConfigure } from './notification-action.configure';
import { notificationActionLeave } from './notification-action.leave';
import { notificationActionPresence } from './notification-action.presence';
import { notificationActionPush } from './notification-action.push';
import { notificationActionWatch } from './notification-action.watch';
import { notificationActionWebPush } from './notification-action.web-push';
import { notificationQuerySettings } from './notification-query.settings';
import { notificationQueryTarget } from './notification-query.target';
import { notificationQueryWebPushKey } from './notification-query.web-push-key';
import type * as NotificationTypes from '../../types/notification.types';
import type { NotificationConfigureInput } from '@repo/contracts/universal';

export function makeNotificationService(params: NotificationTypes.NotificationServiceParams) {
  const deps: NotificationTypes.NotificationServiceDeps = { ...params, presences: new Map(), targets: new Map(), held: new Map() };

  return {
    actions: {
      push: (input: NotificationTypes.NotificationPushParams) => notificationActionPush(deps, input),
      webPush: (input: NotificationTypes.NotificationWebPushParams) => notificationActionWebPush(deps, input),
      presence: (input: NotificationTypes.NotificationPresenceParams) => notificationActionPresence(deps, input),
      leave: (input: NotificationTypes.NotificationLeaveParams) => notificationActionLeave(deps, input),
      configure: (input: NotificationConfigureInput) => notificationActionConfigure(deps, input),
      watch: () => notificationActionWatch(deps),
    },
    queries: {
      settings: () => notificationQuerySettings(deps),
      target: (input: NotificationTypes.NotificationTargetParams) => notificationQueryTarget(deps, input),
      webPushKey: async () => ({ publicKey: (await notificationQueryWebPushKey(deps)).publicKey }),
    },
  };
}

export type NotificationService = ReturnType<typeof makeNotificationService>;
