export const TRANSCRIPTION_SERVICE = {
  credential: 'transcription.openaiApiKey',
  url: 'https://api.openai.com/v1/audio/transcriptions',
  model: 'gpt-transcribe',
  timeoutMs: 120_000,
  rejectedStatuses: [401, 403],
} as const;
