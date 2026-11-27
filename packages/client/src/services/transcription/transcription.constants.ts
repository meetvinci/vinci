export const TRANSCRIPTION_RECORDER = {
  formats: [
    { type: 'audio/webm;codecs=opus', extension: 'webm' },
    { type: 'audio/ogg;codecs=opus', extension: 'ogg' },
    { type: 'audio/mp4', extension: 'mp4' },
    { type: 'audio/webm', extension: 'webm' },
  ],
  bitsPerSecond: 48_000,
  chunkMs: 1000,
  tickMs: 250,
} as const;
