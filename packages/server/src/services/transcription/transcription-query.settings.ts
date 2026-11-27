import { TRANSCRIPTION_SERVICE } from './transcription.constants';
import type { TranscriptionServiceDeps } from '../../types/transcription.types';
import type { TranscriptionSettings } from '@repo/contracts/universal';

export async function transcriptionQuerySettings({ credentials }: TranscriptionServiceDeps): Promise<TranscriptionSettings> {
  return { isConfigured: await credentials.queries.has({ key: TRANSCRIPTION_SERVICE.credential }) };
}
