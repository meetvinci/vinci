import { m } from '@repo/i18n/client';
import { useState } from 'react';
import { PromptInputAttachment, PromptInputDrawer, PromptInputDrawerAlert } from '../ai/prompt-input';
import { InputGroupAddon } from '../input-group';
import { RoomsChatViewer } from './rooms-chat-viewer';
import type { RoomsFilePart } from '@repo/client/client';
import type { useChatAttachmentsWeb } from '@repo/client/web';

interface RoomsChatAttachmentsProps {
  botId: string
  files: ReturnType<typeof useChatAttachmentsWeb>
}

export function RoomsChatAttachments({ botId, files }: RoomsChatAttachmentsProps) {
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const images = files.attachments.filter((item) => item.mediaType.startsWith('image/'));
  const index = images.findIndex((item) => item.key === previewKey);
  const previews: RoomsFilePart[] = images.map((item) => ({ type: 'file', url: item.preview, filename: item.name, mediaType: item.mediaType }));

  if (files.attachments.length === 0) {
    return null;
  }

  const problem = files.failed && m.rooms_files_failed();

  return (
    <>
      {problem ? (
        <PromptInputDrawer variant="destructive">
          <PromptInputDrawerAlert>{problem}</PromptInputDrawerAlert>
        </PromptInputDrawer>
      ) : null}
      <InputGroupAddon align="block-start">
        <div className="flex flex-wrap gap-1">
          {files.attachments.map((item) => (
            <PromptInputAttachment
              image={item.mediaType.startsWith('image/')}
              key={item.key}
              name={item.name}
              preview={item.preview}
              previewLabel={m.rooms_media_open({ name: item.name })}
              removeLabel={m.rooms_files_remove()}
              status={item.status}
              onPreview={item.mediaType.startsWith('image/') ? () => setPreviewKey(item.key) : undefined}
              onRemove={() => files.remove(item.key)}
            />
          ))}
        </div>
      </InputGroupAddon>
      {index >= 0 ? (
        <RoomsChatViewer
          botId={botId}
          images={previews}
          index={index}
          onClose={() => setPreviewKey(null)}
          onIndexChange={(next) => setPreviewKey(images[next].key)}
        />
      ) : null}
    </>
  );
}
