import { SPEECH } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import { speechProviderMessage } from '../../types/speech.types';
import { SPEECH_SERVICE } from './speech.constants';
import { speechPromptsReader } from './speech.prompts';
import type { SpeechDriverParams } from '../../types/speech.types';
import type { SpeechChunk } from '@repo/contracts/universal';

export function speechDriverSpeak({ apiKey, text, signal }: SpeechDriverParams): ReadableStream<SpeechChunk> {
  const listeners = new AbortController();
  const on = { signal: listeners.signal };
  const timeout = AbortSignal.timeout(SPEECH_SERVICE.timeoutMs);
  const socket = new WebSocket(`${SPEECH_SERVICE.url}?model=${SPEECH_SERVICE.model}`, [...SPEECH_SERVICE.protocols, `${SPEECH_SERVICE.keyProtocol}${apiKey}`]);

  const speechDriverRelease = () => {
    listeners.abort();
    socket.close();
  };

  return new ReadableStream<SpeechChunk>({
    start: (controller) => {
      const speechDriverFinish = () => {
        speechDriverRelease();
        controller.close();
      };

      const speechDriverFail = (reason: 'rejected' | 'failed', detail: string) => {
        log.warn({ tag: 'speech', message: `Speech provider ${detail}` });
        speechDriverRelease();
        controller.error(new Errors.SPEECH_FAILED({ reason }));
      };

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            output_modalities: ['audio'],
            instructions: speechPromptsReader,
            reasoning: { effort: SPEECH_SERVICE.reasoningEffort },
            audio: {
              input: { turn_detection: null },
              output: { format: { type: 'audio/pcm', rate: SPEECH.sampleRate }, voice: SPEECH_SERVICE.voice },
            },
          },
        }));
        socket.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }));
        socket.send(JSON.stringify({ type: 'response.create' }));
      }, on);

      socket.addEventListener('message', ({ data }) => match(speechProviderMessage.safeParse(data).data)
        .with({ type: 'response.output_audio.delta' }, ({ delta }) => controller.enqueue({ audio: delta }))
        .with({ type: 'response.done', response: { status: 'completed' } }, speechDriverFinish)
        .with({ type: 'response.done' }, ({ response }) => speechDriverFail('failed', `ended the reply as ${response.status}`))
        .with({ type: 'error', error: { code: P.union(...SPEECH_SERVICE.rejectedCodes) } }, ({ error }) => speechDriverFail('rejected', `refused the key (${error.code})`))
        .with({ type: 'error' }, ({ error }) => speechDriverFail('failed', `answered ${error.code ?? 'an error'}`))
        .otherwise(() => undefined), on);

      socket.addEventListener('error', () => speechDriverFail('failed', 'connection failed'), on);
      socket.addEventListener('close', () => speechDriverFail('failed', 'closed the connection early'), on);
      timeout.addEventListener('abort', () => speechDriverFail('failed', 'timed out'), on);
      signal?.addEventListener('abort', speechDriverFinish, on);
    },
    cancel: speechDriverRelease,
  });
}
