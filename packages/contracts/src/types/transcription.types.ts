import { z } from 'zod';

export const TRANSCRIPTION = {
  maxBytes: 10 * 1024 * 1024,
  maxDurationMs: 5 * 60 * 1000,
  extensions: ['webm', 'ogg', 'mp4', 'm4a', 'mp3', 'wav'],
} as const;

export const transcriptionExtension = z.string()
  .transform((name) => name.slice(name.lastIndexOf('.') + 1).toLowerCase())
  .pipe(z.enum(TRANSCRIPTION.extensions));

export const transcriptionSettings = z.object({ isConfigured: z.boolean() });
export const transcriptionConfigure = z.object({ apiKey: z.string().trim().min(1).max(8192).nullable() });
export const transcriptionSettingsForm = z.object({ apiKey: z.string().trim().max(8192) });
export const transcriptionExport = z.object({ apiKey: z.string().min(1).max(8192).nullable() });

export const transcriptionTranscribe = z.object({
  file: z.file().min(1).max(TRANSCRIPTION.maxBytes).refine((file) => transcriptionExtension.safeParse(file.name).success),
});

export const transcriptionResult = z.object({ text: z.string() });

export type TranscriptionSettings = z.infer<typeof transcriptionSettings>;
export type TranscriptionConfigureInput = z.infer<typeof transcriptionConfigure>;
export type TranscriptionSettingsForm = z.infer<typeof transcriptionSettingsForm>;
export type TranscriptionExport = z.infer<typeof transcriptionExport>;
export type TranscriptionTranscribeInput = z.infer<typeof transcriptionTranscribe>;
export type TranscriptionResult = z.infer<typeof transcriptionResult>;
