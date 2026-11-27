import { transcriptionQuerySettings } from './transcription-query.settings';
import { TRANSCRIPTION_SERVICE } from './transcription.constants';
import type { TranscriptionServiceDeps } from '../../types/transcription.types';
import type { TranscriptionConfigureInput } from '@repo/contracts/universal';

export async function transcriptionActionConfigure(deps: TranscriptionServiceDeps, { apiKey }: TranscriptionConfigureInput) {
  await deps.credentials.actions.set({ key: TRANSCRIPTION_SERVICE.credential, value: apiKey });

  return transcriptionQuerySettings(deps);
}
