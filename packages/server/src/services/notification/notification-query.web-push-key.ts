import { generateVAPIDKeys } from 'web-push';
import { notificationVapidKeys } from '../../types/notification.types';
import { NOTIFICATION } from './notification.constants';
import type { NotificationServiceDeps, NotificationVapidKeys } from '../../types/notification.types';

export function notificationQueryWebPushKey(deps: NotificationServiceDeps): Promise<NotificationVapidKeys> {
  deps.vapid ??= (async () => {
    const stored = notificationVapidKeys.safeParse(JSON.parse(await deps.credentials.queries.get({ key: NOTIFICATION.webPushKeyCredential }) ?? 'null'));

    if (stored.success) {
      return stored.data;
    }

    const keys = generateVAPIDKeys();
    await deps.credentials.actions.set({ key: NOTIFICATION.webPushKeyCredential, value: JSON.stringify(keys) });

    return keys;
  })();

  deps.vapid.catch(() => {
    deps.vapid = undefined;
  });

  return deps.vapid;
}
