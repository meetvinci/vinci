import { TRANSCRIPTION_SERVICE } from './transcription.constants';
import type { TranscriptionServiceDeps } from '../../types/transcription.types';
import type { TranscriptionExport } from '@repo/contracts/universal';

export async function transcriptionQueryExport({ credentials }: TranscriptionServiceDeps): Promise<TranscriptionExport> {
  return { apiKey: await credentials.queries.get({ key: TRANSCRIPTION_SERVICE.credential }) };
}
