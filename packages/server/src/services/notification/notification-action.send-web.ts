import { log } from '@repo/logger/server';
import { sql } from 'kysely';
import { setTimeout as sleep } from 'node:timers/promises';
import { generateRequestDetails } from 'web-push';
import { notificationQueryWebPushKey } from './notification-query.web-push-key';
import { NOTIFICATION } from './notification.constants';
import { notificationBody } from './notification.utils';
import type { NotificationSendWebParams, NotificationServiceDeps } from '../../types/notification.types';
import type { NotificationWebPushPayload } from '@repo/contracts/universal';

export async function notificationActionSendWeb(deps: NotificationServiceDeps, { device, items }: NotificationSendWebParams): Promise<void> {
  const vapid = await notificationQueryWebPushKey(deps);
  const byId = new Map((await deps.bots.queries.list()).map((bot) => [bot.id, bot]));
  const { subscription, url } = device.webPush;
  const page = new URL(url);
  const subject = page.protocol === 'https:' ? page.origin : NOTIFICATION.webPushSubject;

  const statuses = await Promise.all(items.map(async (item) => {
    const bot = byId.get(item.botId);

    if (!bot) {
      return null;
    }

    const payload: NotificationWebPushPayload = {
      kind: item.kind,
      botId: bot.id,
      title: bot.name,
      body: notificationBody(item),
      path: `${NOTIFICATION.chatPath}${bot.handle}`,
    };

    const notificationSendAttempt = async (attempt: number): Promise<number | null> => {
      const isLast = attempt === NOTIFICATION.webPushRetryMs.length;

      try {
        const request = generateRequestDetails(subscription, JSON.stringify(payload), {
          vapidDetails: { subject, ...vapid },
          TTL: NOTIFICATION.webPushTtlSeconds,
          urgency: 'high',
        });

        const response = await fetch(request.endpoint, {
          method: request.method,
          headers: request.headers,
          body: new Uint8Array(request.body),
          signal: AbortSignal.timeout(NOTIFICATION.webPushTimeoutMs),
        });

        const isGone = NOTIFICATION.webPushGoneStatuses.some((gone) => gone === response.status);
        const isRetryable = response.status === 429 || response.status >= 500;

        log.debug({ tag: 'notification', message: `Web Push ${item.kind} to device ${device.id}: ${response.status}` });

        if (!response.ok && !isGone && (!isRetryable || isLast)) {
          log.warn({ tag: 'notification', message: `Web Push failed with status ${response.status}: ${(await response.text()).slice(0, 200)}` });
        }

        if (!isRetryable || isLast) {
          return response.status;
        }
      } catch (error) {
        log.warn({
          tag: 'notification',
          message: `Web Push could not be sent (attempt ${attempt + 1})`,
          error,
        });

        if (isLast) {
          return null;
        }
      }

      await sleep(NOTIFICATION.webPushRetryMs[attempt] ?? 0);

      return notificationSendAttempt(attempt + 1);
    };

    return notificationSendAttempt(0);
  }));

  if (statuses.some((status) => NOTIFICATION.webPushGoneStatuses.some((gone) => gone === status))) {
    await deps.database.db.updateTable('device')
      .set({ webPush: null })
      .where('id', '=', device.id)
      .where(sql<string>`json_extract(web_push, '$.subscription.endpoint')`, '=', subscription.endpoint)
      .execute();
    log.info({ tag: 'notification', message: `Removed the expired Web Push subscription of device ${device.id}` });
  }
}
