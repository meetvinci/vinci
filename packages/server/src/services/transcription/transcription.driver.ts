import { transcriptionResult } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import { TRANSCRIPTION_SERVICE } from './transcription.constants';
import type { TranscriptionDriverParams } from '../../types/transcription.types';

export async function transcriptionDriverTranscribe({ apiKey, file, extension }: TranscriptionDriverParams): Promise<string> {
  const form = new FormData();
  form.set('model', TRANSCRIPTION_SERVICE.model);
  form.set('file', file, `recording.${extension}`);

  const response = await fetch(TRANSCRIPTION_SERVICE.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(TRANSCRIPTION_SERVICE.timeoutMs),
  }).catch((error: unknown) => {
    log.warn({
      tag: 'transcription',
      message: 'Transcription request did not complete',
      error: error instanceof Error ? error.name : 'unknown',
    });
    throw new Errors.TRANSCRIPTION_FAILED({ reason: 'failed' });
  });

  if (!response.ok) {
    await response.body?.cancel();
    log.warn({ tag: 'transcription', message: `Transcription provider answered ${String(response.status)}` });
    throw new Errors.TRANSCRIPTION_FAILED({
      reason: match(response.status)
        .with(P.union(...TRANSCRIPTION_SERVICE.rejectedStatuses), () => 'rejected' as const)
        .otherwise(() => 'failed' as const),
    });
  }

  const reply = transcriptionResult.safeParse(await response.json().catch(() => null));

  if (!reply.success) {
    log.warn({ tag: 'transcription', message: 'Transcription provider answered without text' });
    throw new Errors.TRANSCRIPTION_FAILED({ reason: 'failed' });
  }

  return reply.data.text.trim();
}
