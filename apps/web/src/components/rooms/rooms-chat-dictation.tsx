import { m } from '@repo/i18n/client';
import { PromptInputButton } from '@repo/ui/ai/prompt-input';
import { match } from 'ts-pattern';
import { RoomsChatWaveform } from '@/components/rooms/rooms-chat-waveform';
import IconLoader from '~icons/lucide/loader-2';
import IconMic from '~icons/lucide/mic';
import IconSquare from '~icons/lucide/square';
import IconX from '~icons/lucide/x';
import type { useChatDictation } from '@repo/client/web';

interface RoomsChatDictationProps {
  dictation: ReturnType<typeof useChatDictation>
}

export function RoomsChatDictation({ dictation }: RoomsChatDictationProps) {
  const minutes = Math.floor(dictation.elapsedSeconds / 60);
  const seconds = String(dictation.elapsedSeconds % 60).padStart(2, '0');

  return match(dictation.state)
    .with('recording', () => (
      <fieldset
        aria-label={m.rooms_chat_dictate_recording()}
        className="flex items-center gap-1"
      >
        <span
          aria-hidden
          className="size-2 rounded-full bg-destructive motion-safe:animate-pulse"
        />
        <time
          className="min-w-10 text-center text-xs text-muted-foreground tabular-nums"
          dateTime={`PT${String(dictation.elapsedSeconds)}S`}
        >
          {`${String(minutes)}:${seconds}`}
        </time>
        <RoomsChatWaveform analyser={dictation.analyser} />
        <PromptInputButton
          aria-label={m.rooms_chat_dictate_cancel()}
          title={m.rooms_chat_dictate_cancel()}
          type="button"
          onClick={dictation.cancel}
        >
          <IconX className="size-4" />
        </PromptInputButton>
        <PromptInputButton
          aria-label={m.rooms_chat_dictate_stop()}
          ref={(node) => node?.focus()}
          title={m.rooms_chat_dictate_stop()}
          type="button"
          variant="secondary"
          onClick={dictation.stop}
        >
          <IconSquare className="size-3.5" />
        </PromptInputButton>
      </fieldset>
    ))
    .with('transcribing', () => (
      <PromptInputButton
        disabled
        aria-label={m.rooms_chat_dictate_transcribing()}
        title={m.rooms_chat_dictate_transcribing()}
        type="button"
      >
        <IconLoader className="size-4 animate-spin motion-reduce:animate-none" />
      </PromptInputButton>
    ))
    .with('idle', 'starting', (state) => (
      <PromptInputButton
        aria-label={m.rooms_chat_dictate()}
        disabled={state === 'starting'}
        title={m.rooms_chat_dictate()}
        type="button"
        onClick={dictation.start}
      >
        <IconMic className="size-4" />
      </PromptInputButton>
    ))
    .exhaustive();
}
