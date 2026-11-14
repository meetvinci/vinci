import { z } from 'zod';

export type NotificationKind = 'reply' | 'failure' | 'approval' | 'question';

export interface NotificationItem {
  kind: NotificationKind;
  botId: string;
  conversationId: number;
  taskId?: number;
  entryId?: number;
  expiresAt?: number;
  deliverHere?: boolean;
}

export interface NotificationState {
  pending: NotificationItem[];
  recent: NotificationItem[];
}

export const notificationPlatform = z.enum(['phone', 'computer']);

export const notificationPresence = z.object({
  platform: notificationPlatform,
  isOpen: z.boolean(),
  idleMs: z.number().int().nonnegative(),
});

export const notificationSettings = z.object({ prefer: notificationPlatform });
export const notificationConfigure = notificationSettings.partial();

export const notificationPush = z.object({
  token: z.string().trim().min(1).max(256).nullable(),
  url: z.url({ protocol: /^https?$/ }).max(512).nullable(),
});

export const notificationWebPushSubscription = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1024),
  keys: z.object({ p256dh: z.base64url().max(128), auth: z.base64url().max(64) }),
});

export const notificationWebPush = z.object({
  subscription: notificationWebPushSubscription.nullable(),
  platform: notificationPlatform,
  url: z.url({ protocol: /^https?$/ }).max(512),
});

export interface NotificationWebPushPayload {
  kind: NotificationKind;
  botId: string;
  title: string;
  body: string;
  path: string;
}

export const notificationWebPushKey = z.object({ publicKey: z.string() });

export const notificationWebPushOpen = z.object({ type: z.literal('notification-open'), path: z.string().startsWith('/') });

export const notificationPushData = z.object({ botId: z.uuid(), conversationId: z.number().int() });
export const notificationVoid = z.void();

export type NotificationPlatform = z.infer<typeof notificationPlatform>;
export type NotificationPresenceInput = z.infer<typeof notificationPresence>;
export type NotificationSettings = z.infer<typeof notificationSettings>;
export type NotificationConfigureInput = z.infer<typeof notificationConfigure>;
export type NotificationPushInput = z.infer<typeof notificationPush>;
export type NotificationWebPushInput = z.infer<typeof notificationWebPush>;
export type NotificationWebPushSubscription = z.infer<typeof notificationWebPushSubscription>;
