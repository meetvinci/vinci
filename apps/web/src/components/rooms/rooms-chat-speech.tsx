import { m } from '@repo/i18n/client';
import { PromptInputButton } from '@repo/ui/ai/prompt-input';
import { toasty } from '@repo/ui/sonner';
import IconVolume2 from '~icons/lucide/volume-2';
import IconVolumeOff from '~icons/lucide/volume-off';
import type { SpeechChat } from '@repo/client/web';

interface RoomsChatSpeechProps {
  speech: SpeechChat
}

export function RoomsChatSpeech({ speech }: RoomsChatSpeechProps) {
  const label = speech.isAutoRead ? m.rooms_chat_speak_auto_off() : m.rooms_chat_speak_auto_on();

  function toggle() {
    const isAutoRead = !speech.isAutoRead;

    speech.setAutoRead(isAutoRead);
    toasty(isAutoRead ? m.rooms_chat_speak_auto_started() : m.rooms_chat_speak_auto_stopped(), isAutoRead ? '🔊' : '🔇', { id: 'rooms-chat-speak-auto' });
  }

  return (
    <PromptInputButton
      aria-label={label}
      aria-pressed={speech.isAutoRead}
      title={label}
      variant={speech.isAutoRead ? 'selected' : 'ghost'}
      onClick={toggle}
    >
      {speech.isAutoRead ? <IconVolume2 className="size-4" /> : <IconVolumeOff className="size-4" />}
    </PromptInputButton>
  );
}
