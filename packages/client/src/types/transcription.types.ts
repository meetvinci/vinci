export type TranscriptionState = 'idle' | 'starting' | 'recording' | 'transcribing';

export interface TranscriptionDictationParams {
  botId: string;
  onText: (text: string) => void;
  onProblem: (message: string) => void;
}

export interface TranscriptionRecording {
  recorder: MediaRecorder;
  stream: MediaStream;
  format: { type: string; extension: string };
  generation: number;
  chunks: Blob[];
  shouldTranscribe: boolean;
}
