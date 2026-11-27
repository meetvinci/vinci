import { z } from 'zod';

export const TRANSCRIPTION = {
  maxBytes: 10 * 1024 * 1024,
  maxDurationMs: 5 * 60 * 1000,
  mediaTypes: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'],
} as const;

export const transcriptionMediaType = z.string()
  .transform((type) => type.split(';', 1)[0]?.trim().toLowerCase() ?? '')
  .pipe(z.enum(TRANSCRIPTION.mediaTypes));

export const transcriptionSettings = z.object({ isConfigured: z.boolean() });
export const transcriptionConfigure = z.object({ apiKey: z.string().trim().min(1).max(8192).nullable() });
export const transcriptionSettingsForm = z.object({ apiKey: z.string().trim().max(8192) });
export const transcriptionExport = z.object({ apiKey: z.string().min(1).max(8192).nullable() });

export const transcriptionTranscribe = z.object({
  file: z.file().min(1).max(TRANSCRIPTION.maxBytes).refine((file) => transcriptionMediaType.safeParse(file.type).success),
});

export const transcriptionResult = z.object({ text: z.string() });

export type TranscriptionSettings = z.infer<typeof transcriptionSettings>;
export type TranscriptionConfigureInput = z.infer<typeof transcriptionConfigure>;
export type TranscriptionSettingsForm = z.infer<typeof transcriptionSettingsForm>;
export type TranscriptionExport = z.infer<typeof transcriptionExport>;
export type TranscriptionTranscribeInput = z.infer<typeof transcriptionTranscribe>;
export type TranscriptionResult = z.infer<typeof transcriptionResult>;
