import { SPEECH } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { speechDriverSpeak } from './speech.driver';
import { speechText } from './speech.utils';
import type { SpeechServiceDeps, SpeechSpeakParams } from '../../types/speech.types';
import type { SpeechChunk } from '@repo/contracts/universal';

export async function* speechActionSpeak({ transcription }: SpeechServiceDeps, { text, signal }: SpeechSpeakParams): AsyncGenerator<SpeechChunk> {
  const { apiKey } = await transcription.queries.export();
  const spoken = speechText(text);

  if (apiKey === null) {
    throw new Errors.SPEECH_FAILED({ reason: 'unavailable' });
  }

  if (spoken.length > SPEECH.maxSpokenChars) {
    throw new Errors.SPEECH_FAILED({ reason: 'tooLong' });
  }

  yield* speechDriverSpeak({
    apiKey,
    text: spoken,
    signal,
  });
}
