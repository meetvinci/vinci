import { notificationWebPush, notificationWebPushSubscription } from '@repo/contracts/universal';
import { z } from 'zod';
import type { BotService } from '../services/bot/bot.service';
import type { CredentialsService } from '../services/credentials/credentials.service';
import type { DatabaseService } from '../services/database/database.service';
import type { SettingsService } from '../services/settings/settings.service';
import type * as UniversalTypes from '@repo/contracts/universal';
import type { RuntimeService } from '@repo/runtime/server';

export interface NotificationServiceParams {
  database: DatabaseService;
  runtime: RuntimeService;
  bots: BotService;
  settings: SettingsService;
  credentials: CredentialsService;
}

export const notificationWebPushStored = notificationWebPush.extend({ subscription: notificationWebPushSubscription });

export const notificationVapidKeys = z.object({ publicKey: z.string(), privateKey: z.string() });

export type NotificationWebPushStored = z.infer<typeof notificationWebPushStored>;
export type NotificationVapidKeys = z.infer<typeof notificationVapidKeys>;

export interface NotificationPushDevice {
  id: string;
  pushToken: string | null;
  pushUrl: string | null;
  webPush: NotificationWebPushStored | null;
}

export interface NotificationPresence extends UniversalTypes.NotificationPresenceInput {
  deviceId: string;
  seenAt: number;
}

export interface NotificationHeld {
  item: UniversalTypes.NotificationItem;
  deviceId: string;
  at: number;
}

export interface NotificationServiceDeps extends NotificationServiceParams {
  presences: Map<string, NotificationPresence>;
  targets: Map<string, Promise<string | null>>;
  held: Map<string, NotificationHeld>;
  vapid?: Promise<NotificationVapidKeys>;
}

export interface NotificationDeliverParams {
  items: UniversalTypes.NotificationItem[];
  at: number;
}

export interface NotificationReleaseParams {
  deviceId: string;
  isDue: (held: NotificationHeld) => boolean;
}

export interface NotificationWebPushParams extends UniversalTypes.NotificationWebPushInput {
  deviceId: string;
}

export interface NotificationSendWebParams {
  device: NotificationPushDevice & { webPush: NotificationWebPushStored };
  items: UniversalTypes.NotificationItem[];
}

export interface NotificationPushParams extends UniversalTypes.NotificationPushInput {
  deviceId: string;
}

export interface NotificationPresenceParams extends UniversalTypes.NotificationPresenceInput {
  deviceId: string;
}

export interface NotificationLeaveParams {
  deviceId: string;
}

export interface NotificationAudibleParams {
  items: UniversalTypes.NotificationItem[];
}

export interface NotificationTargetParams {
  item: UniversalTypes.NotificationItem;
}

export interface NotificationSendParams {
  token: string;
  url: string | null;
  items: UniversalTypes.NotificationItem[];
}
