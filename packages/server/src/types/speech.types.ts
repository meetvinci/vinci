import { z } from 'zod';
import type { TranscriptionService } from '../services/transcription/transcription.service';
import type { SpeechSpeakInput } from '@repo/contracts/universal';

export interface SpeechServiceDeps {
  transcription: TranscriptionService;
}

export interface SpeechSpeakParams extends SpeechSpeakInput {
  signal?: AbortSignal;
}

export interface SpeechDriverParams {
  apiKey: string;
  text: string;
  signal?: AbortSignal;
}

export interface SpeechRun {
  kind: 'list' | 'table' | 'text';
  items: string[][];
}

const speechProviderEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('response.output_audio.delta'), delta: z.base64() }),
  z.object({ type: z.literal('response.done'), response: z.object({ status: z.string() }) }),
  z.object({ type: z.literal('error'), error: z.object({ code: z.string().nullish() }) }),
]);

export const speechProviderMessage = z.string()
  .transform((value, context) => {
    try {
      return JSON.parse(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'Not JSON' });

      return z.NEVER;
    }
  })
  .pipe(speechProviderEvent);
