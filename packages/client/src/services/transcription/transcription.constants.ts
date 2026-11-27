export const TRANSCRIPTION_RECORDER = {
  types: ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'],
  fallbackType: 'audio/webm',
  bitsPerSecond: 48_000,
  chunkMs: 1000,
  tickMs: 250,
} as const;
