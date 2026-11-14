import type { NotificationAudibleParams, NotificationServiceDeps } from '../../types/notification.types';

export async function notificationQueryAudible({ bots }: NotificationServiceDeps, { items }: NotificationAudibleParams) {
  const preferences = await bots.queries.preferences();

  return items.filter((item) => preferences.get(item.botId)?.isMuted === false);
}
