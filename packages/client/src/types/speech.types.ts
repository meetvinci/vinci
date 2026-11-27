import type { ChatMessage } from './chat.types';

export type SpeechPhase = 'idle' | 'loading' | 'playing';

export interface SpeechPlayback {
  messageId: string | null;
  phase: SpeechPhase;
}

export interface SpeechChatParams {
  botId: string;
  messages: ChatMessage[];
  isBusy: boolean;
  onProblem: (message: string) => void;
}

export interface SpeechRun {
  controller: AbortController;
  sources: AudioBufferSourceNode[];
  endsAt: number;
  carry: Uint8Array;
}

export interface SpeechChat {
  isAvailable: boolean;
  isAutoRead: boolean;
  playback: SpeechPlayback;
  toggle: (message: ChatMessage) => void;
  stop: () => void;
  setAutoRead: (isOn: boolean) => void;
}
