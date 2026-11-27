import { transcriptionExtension } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { TRANSCRIPTION_SERVICE } from './transcription.constants';
import { transcriptionDriverTranscribe } from './transcription.driver';
import type { TranscriptionServiceDeps } from '../../types/transcription.types';
import type { TranscriptionResult, TranscriptionTranscribeInput } from '@repo/contracts/universal';

export async function transcriptionActionTranscribe(
  { credentials }: TranscriptionServiceDeps,
  { file }: TranscriptionTranscribeInput,
): Promise<TranscriptionResult> {
  const apiKey = await credentials.queries.get({ key: TRANSCRIPTION_SERVICE.credential });
  const extension = transcriptionExtension.safeParse(file.name);

  if (apiKey === null || !extension.success) {
    throw new Errors.TRANSCRIPTION_FAILED({ reason: 'unavailable' });
  }

  const text = await transcriptionDriverTranscribe({
    apiKey,
    file,
    extension: extension.data,
  });

  return { text };
}
