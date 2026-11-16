import { ATTACHMENT } from '@repo/contracts/universal';
import { CHAT_FILE_TYPES, CHAT_IMAGE } from '../services/chat/chat.constants';
import { chatFileType } from '../services/chat/chat.utils';
import { useChatUploads } from './use-chat-uploads';
import type { ChatAttachmentsPlatformParams } from '../types/chat.types';
import type * as ReactTypes from 'react';

export function useChatAttachmentsWeb({ botId, onProblem }: ChatAttachmentsPlatformParams) {
  const files = useChatUploads<File>({
    botId,
    describe: (file) => ({ name: file.name, mediaType: chatFileType({ name: file.name, mediaType: file.type || undefined }), size: file.size }),
    preview: (file) => URL.createObjectURL(file),
    read: chatAttachmentsShrink,
    shrinks: (mediaType) => CHAT_IMAGE.shrinks.some((type) => type === mediaType),
    release: (item) => URL.revokeObjectURL(item.preview),
    onProblem,
  });

  const take = (event: ReactTypes.SyntheticEvent, sources: FileList) => {
    if (sources.length === 0) {
      return;
    }

    event.preventDefault();
    files.add([...sources]);
  };

  return {
    ...files,
    onDragOver: (event: ReactTypes.DragEvent) => {
      if (event.dataTransfer.types.includes('Files')) {
        event.preventDefault();
      }
    },
    onDrop: (event: ReactTypes.DragEvent) => take(event, event.dataTransfer.files),
    onPaste: (event: ReactTypes.ClipboardEvent) => take(event, event.clipboardData.files),
  };
}

async function chatAttachmentsShrink(source: File): Promise<File> {
  const mediaType = chatFileType({ name: source.name, mediaType: source.type || undefined });
  const file = source.type === mediaType ? source : new File([source], source.name, { type: mediaType, lastModified: source.lastModified });
  const isHeic = !ATTACHMENT.mediaTypes.some((type) => type === mediaType);

  if (!CHAT_IMAGE.shrinks.some((type) => type === mediaType)) {
    return file;
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => undefined);

  if (!bitmap) {
    return file;
  }

  const scale = Math.min(1, CHAT_IMAGE.maxSide / Math.max(bitmap.width, bitmap.height));

  if (scale === 1 && !isHeic) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement('canvas');

  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const type = CHAT_IMAGE.kept.find((kept) => kept === mediaType) ?? CHAT_IMAGE.fallbackType;

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, CHAT_IMAGE.quality);
  });

  const extension = Object.entries(CHAT_FILE_TYPES).find(([, kind]) => kind === blob?.type)?.[0];

  return blob && extension ? new File([blob], `${file.name.replace(/\.[^.]*$/u, '')}.${extension}`, { type: blob.type, lastModified: file.lastModified }) : file;
}
