import { notificationItemKey } from '@repo/runtime/server';
import { notificationActionDeliver } from './notification-action.deliver';
import { notificationItems } from './notification.utils';
import type { NotificationServiceDeps } from '../../types/notification.types';

export async function notificationActionWatch(deps: NotificationServiceDeps) {
  const watch = await deps.runtime.watchNotifications();
  let sent = new Set(notificationItems(watch.state.value).map(notificationItemKey));

  const unsubscribe = watch.state.subscribe((state) => {
    const items = notificationItems(state);
    const fresh = items.filter((item) => !sent.has(notificationItemKey(item)));
    sent = new Set(items.map(notificationItemKey));

    if (fresh.length > 0) {
      void notificationActionDeliver(deps, { items: fresh, at: Date.now() });
    }
  });

  return async () => {
    unsubscribe();
    await watch.stop();
  };
}
