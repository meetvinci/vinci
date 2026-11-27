export type TranscriptionState = 'idle' | 'starting' | 'recording' | 'transcribing';

export interface TranscriptionDictationParams {
  onText: (text: string) => void;
  onProblem: (message: string) => void;
}

export interface TranscriptionRecording {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  shouldTranscribe: boolean;
}
