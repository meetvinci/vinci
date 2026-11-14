import { sql } from 'kysely';
import type { NotificationServiceDeps, NotificationWebPushParams } from '../../types/notification.types';

export async function notificationActionWebPush({ database }: NotificationServiceDeps, params: NotificationWebPushParams): Promise<void> {
  const { deviceId, subscription, platform, url } = params;

  await database.db.transaction().execute(async (tx) => {
    if (subscription) {
      await tx.updateTable('device')
        .set({ webPush: null })
        .where(sql<string>`json_extract(web_push, '$.subscription.endpoint')`, '=', subscription.endpoint)
        .execute();
    }

    const webPush = subscription ? JSON.stringify({
      subscription,
      platform,
      url,
    }) : null;

    await tx.updateTable('device').set({ webPush }).where('id', '=', deviceId).execute();
  });
}
