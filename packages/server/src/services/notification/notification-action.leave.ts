import { notificationActionRelease } from './notification-action.release';
import type { NotificationLeaveParams, NotificationServiceDeps } from '../../types/notification.types';

export async function notificationActionLeave(deps: NotificationServiceDeps, { deviceId }: NotificationLeaveParams) {
  const presence = deps.presences.get(deviceId);

  if (presence) {
    deps.presences.set(deviceId, { ...presence, isOpen: false });
  }

  await notificationActionRelease(deps, { deviceId, isDue: () => true });
}
