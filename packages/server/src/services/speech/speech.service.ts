import { speechActionSpeak } from './speech-action.speak';
import type { SpeechServiceDeps, SpeechSpeakParams } from '../../types/speech.types';

export function makeSpeechService(deps: SpeechServiceDeps) {
  return {
    actions: {
      speak: (params: SpeechSpeakParams) => speechActionSpeak(deps, params),
    },
  };
}

export type SpeechService = ReturnType<typeof makeSpeechService>;
