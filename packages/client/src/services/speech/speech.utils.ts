import { ORPCError } from '@orpc/client';
import { errorSchemas } from '@repo/errors/universal';
import { m } from '@repo/i18n/client';
import { match, P } from 'ts-pattern';

export function speechProblem(error: Error): string {
  const speechFailed = () => m.rooms_chat_speak_failed();

  return match(error)
    .with(P.instanceOf(ORPCError), (failure) => match(failure.code)
      .with('SPEECH_FAILED', () => match(errorSchemas.SPEECH_FAILED.data.safeParse(failure.data).data?.reason)
        .with('rejected', () => m.rooms_chat_speak_rejected())
        .with('unavailable', () => m.rooms_chat_speak_unavailable())
        .with('tooLong', () => m.rooms_chat_speak_too_long())
        .otherwise(speechFailed))
      .with('VALIDATION_ERROR', () => m.rooms_chat_speak_too_long())
      .with('RATE_LIMITED', () => m.rooms_chat_speak_busy())
      .otherwise(speechFailed))
    .otherwise(speechFailed);
}

export function speechBytes(audio: string, carry: Uint8Array): Uint8Array {
  const decoded = Uint8Array.from(atob(audio), (character) => character.charCodeAt(0));
  const bytes = new Uint8Array(carry.length + decoded.length);

  bytes.set(carry);
  bytes.set(decoded, carry.length);

  return bytes;
}

export function speechSamples(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length - (bytes.length % 2));

  return Float32Array.from({ length: view.byteLength / 2 }, (_value, index) => view.getInt16(index * 2, true) / 32_768);
}
