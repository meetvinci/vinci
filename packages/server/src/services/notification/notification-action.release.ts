import { notificationActionDeliver } from './notification-action.deliver';
import { notificationHeldTake } from './notification.utils';
import type { NotificationReleaseParams, NotificationServiceDeps } from '../../types/notification.types';

export async function notificationActionRelease(deps: NotificationServiceDeps, params: NotificationReleaseParams): Promise<void> {
  const items = notificationHeldTake(deps, params);

  if (items.length > 0) {
    await notificationActionDeliver(deps, { items, at: Date.now() });
  }
}
