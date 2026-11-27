import { transcriptionActionConfigure } from './transcription-action.configure';
import { transcriptionActionTranscribe } from './transcription-action.transcribe';
import { transcriptionQueryExport } from './transcription-query.export';
import { transcriptionQuerySettings } from './transcription-query.settings';
import { TRANSCRIPTION_SERVICE } from './transcription.constants';
import type { TranscriptionOwnsKeyParams, TranscriptionServiceDeps } from '../../types/transcription.types';
import type { TranscriptionConfigureInput, TranscriptionTranscribeInput } from '@repo/contracts/universal';

export function makeTranscriptionService(deps: TranscriptionServiceDeps) {
  return {
    actions: {
      configure: (params: TranscriptionConfigureInput) => transcriptionActionConfigure(deps, params),
      transcribe: (params: TranscriptionTranscribeInput) => transcriptionActionTranscribe(deps, params),
    },
    queries: {
      settings: () => transcriptionQuerySettings(deps),
      export: () => transcriptionQueryExport(deps),
      ownsKey: ({ key }: TranscriptionOwnsKeyParams) => key === TRANSCRIPTION_SERVICE.credential,
    },
  };
}

export type TranscriptionService = ReturnType<typeof makeTranscriptionService>;
