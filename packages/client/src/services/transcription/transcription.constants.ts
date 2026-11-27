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
  waveform: {
    bars: 32,
    sampleMs: 80,
    fftSize: 1024,
    gain: 1.8,
    floor: 0.1,
    meterBars: 5,
    meterSamples: 6,
  },
} as const;
