import { z } from 'zod';

export const SPEECH = {
  maxInputChars: 32_000,
  maxSpokenChars: 6000,
  sampleRate: 24_000,
} as const;

export const speechSpeak = z.object({ text: z.string().trim().min(1).max(SPEECH.maxInputChars) });

export const speechChunk = z.object({ audio: z.base64() });

export type SpeechSpeakInput = z.infer<typeof speechSpeak>;
export type SpeechChunk = z.infer<typeof speechChunk>;
