import type { CredentialsService } from '../services/credentials/credentials.service';

export interface TranscriptionServiceDeps {
  credentials: CredentialsService;
}

export interface TranscriptionOwnsKeyParams {
  key: string;
}

export interface TranscriptionDriverParams {
  apiKey: string;
  file: File;
  extension: string;
}
