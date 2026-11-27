import { m } from '@repo/i18n/client';
import { PromptInputButton } from '@repo/ui/ai/prompt-input';
import IconAudioLines from '~icons/lucide/audio-lines';
import type { SpeechChat } from '@repo/client/web';

interface RoomsChatSpeechProps {
  speech: SpeechChat
}

export function RoomsChatSpeech({ speech }: RoomsChatSpeechProps) {
  return (
    <PromptInputButton
      aria-label={m.rooms_chat_speak_auto()}
      aria-pressed={speech.isAutoRead}
      title={m.rooms_chat_speak_auto()}
      type="button"
      variant={speech.isAutoRead ? 'secondary' : 'ghost'}
      onClick={() => speech.setAutoRead(!speech.isAutoRead)}
    >
      <IconAudioLines className="size-4" />
    </PromptInputButton>
  );
}
