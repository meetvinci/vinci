import { notificationWebPushStored } from '../../types/notification.types';
import type { NotificationPushDevice, NotificationServiceDeps } from '../../types/notification.types';

export async function notificationQueryDevices({ database }: NotificationServiceDeps): Promise<NotificationPushDevice[]> {
  const rows = await database.db.selectFrom('device')
    .select(['id', 'pushToken', 'pushUrl', 'webPush'])
    .where((eb) => eb.or([eb('pushToken', 'is not', null), eb('webPush', 'is not', null)]))
    .execute();

  return rows.map((row) => ({ ...row, webPush: row.webPush ? notificationWebPushStored.safeParse(JSON.parse(row.webPush)).data ?? null : null }));
}
