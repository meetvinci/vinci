import { ORPCError } from '@orpc/client';
import { errorSchemas } from '@repo/errors/universal';
import { m } from '@repo/i18n/client';
import { match, P } from 'ts-pattern';

export function transcriptionProblem(error: Error): string {
  const transcriptionFailed = () => m.rooms_chat_dictate_failed();

  return match(error)
    .with(P.instanceOf(ORPCError), (failure) => match(failure.code)
      .with('TRANSCRIPTION_FAILED', () => match(errorSchemas.TRANSCRIPTION_FAILED.data.safeParse(failure.data).data?.reason)
        .with('rejected', () => m.rooms_chat_dictate_rejected())
        .with('unavailable', () => m.rooms_chat_dictate_unavailable())
        .otherwise(transcriptionFailed))
      .with(P.union('VALIDATION_ERROR', 'PAYLOAD_TOO_LARGE'), () => m.rooms_chat_dictate_too_large())
      .with('RATE_LIMITED', () => m.rooms_chat_dictate_busy())
      .otherwise(transcriptionFailed))
    .otherwise(transcriptionFailed);
}
