import * as m from '@repo/i18n/messages';
import { match } from 'ts-pattern';
import { NOTIFICATION } from './notification.constants';
import type { NotificationPresence, NotificationReleaseParams, NotificationServiceDeps } from '../../types/notification.types';
import type { NotificationItem, NotificationState } from '@repo/contracts/universal';

export function notificationBody(item: NotificationItem) {
  return match(item.kind)
    .with('reply', () => m.rooms_notify_reply())
    .with('failure', () => m.rooms_notify_failed())
    .with('approval', () => m.rooms_notify_approval())
    .with('question', () => m.rooms_notify_question())
    .exhaustive();
}

export function notificationItems(state: NotificationState) {
  return [...state.recent, ...state.pending];
}

export function notificationActiveAt(presence: NotificationPresence) {
  return presence.seenAt - presence.idleMs;
}

export function notificationHeldTake(deps: NotificationServiceDeps, { deviceId, isDue }: NotificationReleaseParams) {
  const due = [...deps.held.entries()].filter(([, held]) => held.deviceId === deviceId && isDue(held));

  for (const [key] of due) {
    deps.held.delete(key);
    deps.targets.delete(key);
  }

  return due.map(([, held]) => held.item);
}

export function notificationIsOpen(presence: NotificationPresence | undefined, now: number) {
  return presence !== undefined && presence.isOpen && now - presence.seenAt < NOTIFICATION.openMs;
}
