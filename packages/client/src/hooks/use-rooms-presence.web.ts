import { useNotificationPresence } from '@repo/client/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { chatQueries } from '../services/chat/chat.client';
import { ROOMS_PRESENCE_EVENTS } from '../services/rooms/rooms.constants';
import { useIsTouch } from './use-is-touch.web';
import { useRpc } from './use-rpc';

export function useRoomsPresence() {
  const activeAt = useRef(0);
  const isTouch = useIsTouch();
  const rpcs = useRpc();
  const { data: notifications } = useQuery(chatQueries.notifications(rpcs));

  const received = [...notifications?.pending ?? [], ...notifications?.recent ?? []]
    .filter((item) => item.deliverHere)
    .map((item) => `${item.kind}:${item.botId}:${item.conversationId}:${item.taskId ?? 0}:${item.entryId ?? 0}`)
    .join(' ');

  const isVisible = useSyncExternalStore(
    (onStoreChange) => {
      document.addEventListener('visibilitychange', onStoreChange);

      return () => document.removeEventListener('visibilitychange', onStoreChange);
    },
    () => document.visibilityState === 'visible',
    () => true,
  );

  useEffect(() => {
    const touch = () => {
      activeAt.current = Date.now();
    };

    touch();

    for (const event of ROOMS_PRESENCE_EVENTS) {
      window.addEventListener(event, touch, { passive: true });
    }

    return () => {
      for (const event of ROOMS_PRESENCE_EVENTS) {
        window.removeEventListener(event, touch);
      }
    };
  }, []);

  useNotificationPresence({
    platform: isTouch ? 'phone' : 'computer',
    isOpen: !isTouch || isVisible,
    idleMs: () => Date.now() - activeAt.current,
    received,
  });
}
