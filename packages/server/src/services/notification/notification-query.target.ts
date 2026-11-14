import { notificationItemKey } from '@repo/runtime/server';
import { notificationQueryDevices } from './notification-query.devices';
import { notificationQuerySettings } from './notification-query.settings';
import { NOTIFICATION } from './notification.constants';
import { notificationActiveAt, notificationIsOpen } from './notification.utils';
import type { NotificationServiceDeps, NotificationTargetParams } from '../../types/notification.types';

export function notificationQueryTarget(deps: NotificationServiceDeps, { item }: NotificationTargetParams) {
  const key = notificationItemKey(item);
  const known = deps.targets.get(key);

  if (known) {
    return known;
  }

  const target = (async () => {
    const now = Date.now();
    const open = [...deps.presences.values()].filter((presence) => notificationIsOpen(presence, now));

    const active = open
      .filter((presence) => now - notificationActiveAt(presence) < NOTIFICATION.idleMs)
      .sort((left, right) => notificationActiveAt(right) - notificationActiveAt(left))
      .at(0);

    if (active) {
      return active.deviceId;
    }

    const { prefer } = await notificationQuerySettings(deps);
    const notificationSeenAt = (id: string) => deps.presences.get(id)?.seenAt ?? 0;
    const devices = (await notificationQueryDevices(deps)).sort((left, right) => notificationSeenAt(right.id) - notificationSeenAt(left.id));

    const phone = devices.find((device) => device.pushToken !== null || device.webPush?.platform === 'phone')?.id;

    const computer = open.filter((presence) => presence.platform === 'computer').sort((left, right) => right.seenAt - left.seenAt).at(0)?.deviceId
      ?? devices.find((device) => device.pushToken === null && device.webPush?.platform === 'computer')?.id;

    return (prefer === 'phone' ? phone ?? computer : computer ?? phone) ?? null;
  })();

  deps.targets.set(key, target);

  if (deps.targets.size > NOTIFICATION.targetsMax) {
    deps.targets.delete(deps.targets.keys().next().value ?? key);
  }

  return target;
}
