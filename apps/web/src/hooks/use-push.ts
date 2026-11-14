import { notificationWebPushOpen } from '@repo/contracts/universal';
import { useQuery } from '@tanstack/react-query';
import { useMatch, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { pushClear, pushSync } from '@/services/push/push.client';
import { rpc } from '@/services/rpc/rpc.client';

export function usePush() {
  const router = useRouter();
  const handle = useMatch({ from: '/_chat/rooms/direct/$handle', shouldThrow: false })?.params.handle;
  const bots = useQuery(rpc.bots.list.queryOptions());

  useEffect(() => {
    void pushSync().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!Object.hasOwn(globalThis, 'ServiceWorkerContainer')) {
      return;
    }

    const open = (event: MessageEvent) => {
      const message = notificationWebPushOpen.safeParse(event.data);

      if (message.success) {
        router.history.push(message.data.path);
      }
    };

    navigator.serviceWorker.addEventListener('message', open);

    return () => navigator.serviceWorker.removeEventListener('message', open);
  }, [router]);

  useEffect(() => {
    const bot = bots.data?.find((candidate) => candidate.handle === handle);

    if (!bot) {
      return;
    }

    const clear = () => {
      if (document.visibilityState === 'visible') {
        void pushClear({ botId: bot.id }).catch(() => undefined);
      }
    };

    clear();
    document.addEventListener('visibilitychange', clear);

    return () => document.removeEventListener('visibilitychange', clear);
  }, [bots.data, handle]);
}
