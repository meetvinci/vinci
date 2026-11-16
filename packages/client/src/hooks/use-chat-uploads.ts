import { ORPCError } from '@orpc/client';
import { ATTACHMENT } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { useMutation } from '@tanstack/react-query';
import { generateId } from 'ai';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { CHAT } from '../services/chat/chat.constants';
import { useRpc } from './use-rpc';
import type { RoomsAttachment, RoomsAttachmentsParams, RoomsSourcedAttachment } from '../types/rooms.types';

export function useChatUploads<Source>({ botId, describe, preview, read, shrinks, release, onFailed, onProblem }: RoomsAttachmentsParams<Source>) {
  const { rpc } = useRpc();
  const [attachments, setAttachments] = useState<RoomsSourcedAttachment<Source>[]>([]);
  const [shownBotId, setShownBotId] = useState(botId);
  const kept = useRef(new Map<string, RoomsSourcedAttachment<Source>>());
  const upload = useMutation(rpc.attachments.upload.mutationOptions());
  const discard = useMutation(rpc.attachments.remove.mutationOptions());
  const remaining = ATTACHMENT.maxPerMessage - attachments.length;

  const releaseAll = useEffectEvent(() => {
    for (const item of kept.current.values()) {
      release?.(item);
    }

    kept.current.clear();
  });

  useEffect(() => () => releaseAll(), [botId]);

  if (shownBotId !== botId) {
    setShownBotId(botId);
    setAttachments([]);
  }

  const change = (key: string, update: Partial<RoomsSourcedAttachment<Source>>) => {
    setAttachments((items) => items.map((item) => (item.key === key ? { ...item, ...update } : item)));
  };

  const store = async (item: RoomsSourcedAttachment<Source>) => {
    try {
      const file = await read(item.source);
      const problem = chatUploadsProblem(item, file, shrinks?.(item.mediaType) === true);

      if (problem) {
        drop([item.key]);
        onProblem(problem);

        return;
      }

      const saved = await upload.mutateAsync({ botId, file });

      if (!kept.current.has(item.key)) {
        discard.mutate({ botId, attachmentId: saved.id });
        return;
      }

      change(item.key, {
        id: saved.id,
        name: saved.name,
        status: 'ready',
      });
    } catch (error) {
      change(item.key, { status: 'failed' });

      if (error instanceof ORPCError && error.code === 'DISK_FULL') {
        onProblem(m.rooms_files_disk_full());
      } else {
        onFailed?.(item);
      }
    }
  };

  const send = (item: RoomsSourcedAttachment<Source>) => {
    change(item.key, { status: 'uploading' });
    void store(item);
  };

  const add = (sources: Source[]) => {
    const files = sources.map((source) => ({ source, ...describe(source) }));
    const typed = files.filter((file) => ATTACHMENT.mediaTypes.some((type) => type === file.mediaType) || shrinks?.(file.mediaType));
    const sized = typed.filter((file) => file.size <= ATTACHMENT.maxBytes || shrinks?.(file.mediaType));
    const tooBig = typed.find((file) => !sized.includes(file));
    const accepted = sized.slice(0, Math.max(0, remaining));

    for (const file of accepted) {
      const item: RoomsSourcedAttachment<Source> = { key: generateId(), id: null, name: file.name, mediaType: file.mediaType, preview: preview(file.source), status: 'uploading', source: file.source };

      kept.current.set(item.key, item);
      setAttachments((items) => [...items, item]);
      send(item);
    }

    const problem = [
      typed.length < files.length ? m.rooms_files_type() : undefined,
      tooBig ? chatUploadsTooBig(tooBig.name, tooBig.size) : undefined,
      accepted.length < sized.length ? m.rooms_files_too_many({ count: ATTACHMENT.maxPerMessage }) : undefined,
    ].find(Boolean);

    if (problem) {
      onProblem(problem);
    }
  };

  const drop = (keys: string[]) => {
    for (const key of keys) {
      const item = kept.current.get(key);

      if (item) {
        release?.(item);
      }

      kept.current.delete(key);
    }

    setAttachments((items) => items.filter((item) => !keys.includes(item.key)));
  };

  const remove = (key: string) => {
    for (const attachmentId of attachments.flatMap((item) => (item.key === key && item.id ? [item.id] : []))) {
      discard.mutate({ botId, attachmentId });
    }

    drop([key]);
  };

  const retry = (key: string) => {
    const item = attachments.find((attachment) => attachment.key === key);

    if (item) {
      send(item);
    }
  };

  return {
    attachments,
    add,
    remove,
    retry,
    clear: (ids: string[]) => drop(attachments.flatMap((item) => (item.id && ids.includes(item.id) ? [item.key] : []))),
    readyIds: attachments.flatMap((item) => (item.id && item.status === 'ready' ? [item.id] : [])),
    uploading: attachments.some((item) => item.status === 'uploading'),
    failed: attachments.some((item) => item.status === 'failed'),
    isFull: remaining <= 0,
    remaining,
  };
}

function chatUploadsTooBig(name: string, size: number) {
  return m.rooms_files_too_big({
    name,
    size: (Math.ceil((size * 10) / CHAT.megabyte) / 10).toFixed(1),
    limit: ATTACHMENT.maxBytes / CHAT.megabyte,
  });
}

function chatUploadsProblem({ name }: Pick<RoomsAttachment, 'name'>, file: File, isShrunk: boolean) {
  if (isShrunk && !ATTACHMENT.mediaTypes.some((type) => type === file.type)) {
    return m.rooms_files_heic({ name });
  }

  return file.size > ATTACHMENT.maxBytes ? chatUploadsTooBig(name, file.size) : undefined;
}
