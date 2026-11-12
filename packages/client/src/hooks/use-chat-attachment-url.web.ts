import { useQuery } from '@tanstack/react-query';
import { chatQueries } from '../services/chat/chat.client';
import { CHAT } from '../services/chat/chat.constants';
import { roomsAttachmentPath } from '../services/rooms/rooms.utils';
import { useRpc } from './use-rpc';

export function useChatAttachmentUrl(botId: string, url: string, isEnabled = true) {
  const rpcs = useRpc();
  const attachmentId = url.startsWith(CHAT.attachmentScheme) ? url.slice(CHAT.attachmentScheme.length) : undefined;

  const { data: objectUrl } = useQuery({
    ...chatQueries.attachmentUrl(rpcs, { botId, attachmentId: attachmentId ?? '' }),
    enabled: isEnabled && attachmentId !== undefined && !rpcs.fileSrc,
  });

  if (attachmentId === undefined) {
    return url;
  }

  return rpcs.fileSrc ? rpcs.fileSrc(roomsAttachmentPath(botId, url)) : objectUrl;
}
