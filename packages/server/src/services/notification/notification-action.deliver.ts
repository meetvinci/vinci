import { log } from '@repo/logger/server';
import { notificationItemKey } from '@repo/runtime/server';
import { notificationActionSend } from './notification-action.send';
import { notificationActionSendWeb } from './notification-action.send-web';
import { notificationQueryAudible } from './notification-query.audible';
import { notificationQueryDevices } from './notification-query.devices';
import { notificationQueryTarget } from './notification-query.target';
import { NOTIFICATION } from './notification.constants';
import { notificationHeldTake, notificationIsOpen } from './notification.utils';
import type { NotificationDeliverParams, NotificationServiceDeps } from '../../types/notification.types';

export async function notificationActionDeliver(deps: NotificationServiceDeps, { items, at }: NotificationDeliverParams): Promise<void> {
  const notificationHeldExpire = async (deviceId: string) => {
    const presence = deps.presences.get(deviceId);
    const isSilent = presence === undefined || presence.seenAt <= at;

    if (isSilent && presence) {
      deps.presences.set(deviceId, { ...presence, isOpen: false });
    }

    const expired = notificationHeldTake(deps, { deviceId, isDue: (held) => held.at === at });

    if (isSilent && expired.length > 0) {
      log.debug({ tag: 'notification', message: `Device ${deviceId} did not confirm ${expired.length} item(s); delivering again` });
      await notificationActionDeliver(deps, { items: expired, at: Date.now() });
    }
  };

  try {
    const audible = await notificationQueryAudible(deps, { items });
    const targets = await Promise.all(audible.map((item) => notificationQueryTarget(deps, { item })));
    const devices = await notificationQueryDevices(deps);
    const openIds = new Set([...deps.presences.values()].filter((presence) => notificationIsOpen(presence, Date.now())).map((presence) => presence.deviceId));

    log.debug({ tag: 'notification', message: `Deliver ${audible.map((item, index) => `${item.kind} to ${targets[index] ?? 'nobody'}`).join(', ') || 'nothing'}` });

    for (const [index, item] of audible.entries()) {
      const deviceId = targets[index];
      const hasExpo = devices.some((device) => device.id === deviceId && device.pushToken !== null);

      if (deviceId && openIds.has(deviceId) && !hasExpo) {
        deps.held.set(notificationItemKey(item), {
          item,
          deviceId,
          at,
        });
        setTimeout(() => void notificationHeldExpire(deviceId), NOTIFICATION.holdMs);
      }
    }

    await Promise.all(devices.map(async (device) => {
      const mine = audible.filter((_, index) => targets[index] === device.id);

      if (mine.length === 0) {
        return;
      }

      if (device.pushToken) {
        await notificationActionSend(deps, {
          token: device.pushToken,
          url: device.pushUrl,
          items: mine,
        });
      }

      if (device.webPush && !openIds.has(device.id)) {
        await notificationActionSendWeb(deps, { device: { ...device, webPush: device.webPush }, items: mine });
      }
    }));
  } catch (error) {
    log.warn({
      tag: 'notification',
      message: 'Notifications could not be delivered',
      error,
    });
  }
}
