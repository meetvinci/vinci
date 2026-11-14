import { notificationActionRelease } from './notification-action.release';
import type { NotificationPresenceParams, NotificationServiceDeps } from '../../types/notification.types';

export async function notificationActionPresence(deps: NotificationServiceDeps, presence: NotificationPresenceParams) {
  deps.presences.set(presence.deviceId, { ...presence, seenAt: Date.now() });

  if (!presence.isOpen) {
    await notificationActionRelease(deps, { deviceId: presence.deviceId, isDue: () => true });
  }
}
