import { notificationWebPushSubscription } from '@repo/contracts/universal';
import { layoutIsIos } from '@/services/layout/layout.client';
import { PUSH } from '@/services/push/push.constants';
import { pushHasWorker, pushKeyBytes, pushSameKey } from '@/services/push/push.utils';
import { rpcClient } from '@/services/rpc/rpc.client';
import type { PushClearParams, PushShowParams, PushState } from '@/types/push.types';
import type { NotificationPlatform } from '@repo/contracts/universal';

export function pushPlatform(): NotificationPlatform {
  return window.matchMedia(PUSH.touchQuery).matches ? 'phone' : 'computer';
}

export function pushState(): PushState {
  if (window.__electrobunSendToHost) {
    return { status: 'desktop', background: true };
  }

  if (!Object.hasOwn(globalThis, 'Notification')) {
    return { status: layoutIsIos() && document.documentElement.dataset.shell !== 'standalone' ? 'install' : 'unsupported', background: false };
  }

  const background = pushHasWorker();

  if (Notification.permission === 'granted') {
    return { status: 'on', background };
  }

  return { status: Notification.permission === 'denied' ? 'blocked' : 'off', background };
}

export async function pushSync() {
  if (!pushHasWorker() || window.__electrobunSendToHost) {
    return;
  }

  await navigator.serviceWorker.register(PUSH.workerPath, { scope: '/', updateViaCache: 'none' });
  const registration = await navigator.serviceWorker.ready;
  const current = await registration.pushManager.getSubscription();
  const device = { platform: pushPlatform(), url: location.origin };

  if (Notification.permission !== 'granted') {
    await current?.unsubscribe();
    await rpcClient.notifications.webPush({ ...device, subscription: null });

    return;
  }

  const key = pushKeyBytes((await rpcClient.notifications.webPushKey()).publicKey);
  const kept = current && pushSameKey(current.options.applicationServerKey, key) ? current : null;

  if (current && !kept) {
    await current.unsubscribe();
  }

  const subscription = kept ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

  await rpcClient.notifications.webPush({ ...device, subscription: notificationWebPushSubscription.parse(subscription.toJSON()) });
}

export async function pushEnable() {
  if (pushState().status === 'off') {
    await Notification.requestPermission();
    await pushSync();
  }

  return pushState();
}

export function pushAskOnce() {
  try {
    if (localStorage.getItem(PUSH.askedKey) === 'true') {
      return;
    }

    localStorage.setItem(PUSH.askedKey, 'true');
  } catch {
    return;
  }

  void pushEnable().catch(() => undefined);
}

export async function pushShow({ payload, icon }: PushShowParams) {
  const registration = pushHasWorker() ? await navigator.serviceWorker.getRegistration() : undefined;

  if (!registration?.active) {
    return false;
  }

  await registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.botId,
    icon,
    silent: true,
    data: { path: payload.path },
  });

  return true;
}

export async function pushClear({ botId }: PushClearParams) {
  const registration = pushHasWorker() ? await navigator.serviceWorker.getRegistration() : undefined;
  const shown = await registration?.getNotifications({ tag: botId }) ?? [];

  for (const notification of shown) {
    notification.close();
  }
}
