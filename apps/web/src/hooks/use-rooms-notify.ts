import { ROOMS } from '@repo/client/client';
import { useChatPendingSync } from '@repo/client/react';
import { AVATAR } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useEffectEvent, useRef } from 'react';
import { match } from 'ts-pattern';
import { pushPlatform, pushShow } from '@/services/push/push.client';
import { roomsLink } from '@/services/rooms/rooms.client';
import { rpc } from '@/services/rpc/rpc.client';
import type { NotificationItem } from '@repo/contracts/universal';

export function useRoomsNotify() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  const notifications = useChatPendingSync();

  const show = useEffectEvent((item: NotificationItem) => {
    const chat = queryClient.getQueryData(rpc.conversation.list.queryKey())?.find((candidate) => candidate.botId === item.botId);
    const desktop = window.__electrobunSendToHost;
    const browser = Object.hasOwn(globalThis, 'Notification') && Notification.permission === 'granted';

    const isHiddenPhone = pushPlatform() === 'phone' && document.visibilityState !== 'visible';

    if ((!desktop && !browser) || !chat || chat.isMuted || isHiddenPhone) {
      return;
    }

    const link = roomsLink({ handle: chat.handle });
    const path = router.buildLocation(link).pathname;

    if (document.visibilityState === 'visible' && document.hasFocus() && path === router.state.location.pathname) {
      return;
    }

    const body = match(item.kind)
      .with('reply', () => chat.lastMessage?.preview ?? '')
      .with('failure', () => m.rooms_notify_failed())
      .with('approval', () => m.rooms_notify_approval())
      .with('question', () => m.rooms_notify_question())
      .exhaustive();

    if (desktop) {
      desktop({ notify: { title: chat.name, body, botId: chat.botId } });
      return;
    }

    const icon = `${AVATAR.pathPrefix}bots/${chat.botId}.png`;

    const payload = {
      kind: item.kind,
      botId: chat.botId,
      title: chat.name,
      body,
      path,
    };

    void pushShow({ payload, icon }).then((isShown) => {
      if (isShown) {
        return;
      }

      const notification = new Notification(chat.name, {
        body,
        icon,
        silent: true,
        tag: chat.botId,
      });

      notification.addEventListener('click', () => {
        window.focus();
        void router.navigate(link);
        notification.close();
      });
    });

    const audio = new AudioContext();

    for (const [index, hz] of ROOMS.chime.notesHz.entries()) {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + index * ROOMS.chime.noteSeconds;

      tone.frequency.value = hz;
      gain.gain.setValueAtTime(ROOMS.chime.volume, start);
      gain.gain.exponentialRampToValueAtTime(ROOMS.chime.fadeTo, start + ROOMS.chime.noteSeconds * 2);
      tone.connect(gain).connect(audio.destination);
      tone.start(start);
      tone.stop(start + ROOMS.chime.noteSeconds * 2);
    }

    setTimeout(() => void audio.close(), ROOMS.chime.closeMs);
  });

  useEffect(() => {
    if (!notifications) {
      return;
    }

    const items = [...notifications.pending, ...notifications.recent];
    const keys = items.map((item) => `${item.kind}:${item.botId}:${item.conversationId}:${item.taskId ?? 0}:${item.entryId ?? 0}`);

    if (seen.current) {
      for (const [index, item] of items.entries()) {
        if (item.deliverHere && !seen.current.has(keys[index] ?? '')) {
          show(item);
        }
      }
    }

    seen.current = new Set(keys);
  }, [notifications, queryClient]);
}
