import { SPEECH } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { match, P } from 'ts-pattern';
import { CHAT } from '../services/chat/chat.constants';
import { roomsMessageText } from '../services/rooms/rooms.utils';
import { SPEECH_PLAYER } from '../services/speech/speech.constants';
import { speechBytes, speechProblem, speechSamples } from '../services/speech/speech.utils';
import { useRpc } from './use-rpc';
import type { ChatMessage } from '../types/chat.types';
import type * as SpeechTypes from '../types/speech.types';

export function useChatSpeech({ botId, messages, isBusy, onProblem }: SpeechTypes.SpeechChatParams): SpeechTypes.SpeechChat {
  const { rpc, client } = useRpc();
  const settings = useQuery(rpc.transcription.settings.queryOptions());
  const isSupported = useSyncExternalStore(useChatSpeechSubscribe, useChatSpeechIsSupported, () => false);
  const [playback, setPlayback] = useState<SpeechTypes.SpeechPlayback>({ messageId: null, phase: 'idle' });
  const [isAutoRead, setIsAutoRead] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const run = useRef<SpeechTypes.SpeechRun | null>(null);
  const heardEntryId = useRef(0);

  const stop = () => {
    const current = run.current;

    run.current = null;
    current?.controller.abort();
    current?.sources.forEach((source) => source.stop());
    setPlayback({ messageId: null, phase: 'idle' });
  };

  const unlock = () => {
    const context = audio.current ?? new AudioContext();

    audio.current = context;
    void context.resume();

    return context;
  };

  const schedule = (current: SpeechTypes.SpeechRun, context: AudioContext, chunk: string) => {
    const bytes = speechBytes(chunk, current.carry);
    const samples = speechSamples(bytes);

    current.carry = bytes.slice(samples.length * 2);

    if (samples.length === 0) {
      return;
    }

    const buffer = context.createBuffer(1, samples.length, SPEECH.sampleRate);
    const source = context.createBufferSource();
    const startsAt = Math.max(context.currentTime + SPEECH_PLAYER.leadSeconds, current.endsAt);

    buffer.copyToChannel(samples, 0);
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(startsAt);
    current.sources.push(source);
    current.endsAt = startsAt + buffer.duration;
  };

  const play = async (message: ChatMessage) => {
    stop();

    const context = unlock();
    const current: SpeechTypes.SpeechRun = { controller: new AbortController(), sources: [], endsAt: 0, carry: new Uint8Array() };

    run.current = current;
    setPlayback({ messageId: message.id, phase: 'loading' });

    try {
      const stream = await client.speech.speak({ text: roomsMessageText(message) }, { signal: current.controller.signal });

      for await (const { audio: chunk } of stream) {
        if (run.current !== current) {
          return;
        }

        schedule(current, context, chunk);

        if (current.sources.length === 1) {
          setPlayback({ messageId: message.id, phase: 'playing' });
        }
      }

      match({ last: current.sources.at(-1), isRunning: context.state === 'running' })
        .with({ last: undefined }, () => stop())
        .with({ isRunning: false }, () => {
          stop();
          onProblem(m.rooms_chat_speak_blocked());
        })
        .otherwise(({ last }) => last?.addEventListener('ended', () => match(run.current === current)
          .with(true, stop)
          .otherwise(() => undefined)));
    } catch (error) {
      if (run.current === current) {
        stop();
        onProblem(match(error)
          .with(P.instanceOf(Error), speechProblem)
          .otherwise(() => m.rooms_chat_speak_failed()));
      }
    }
  };

  const toggle = (message: ChatMessage) => match(playback.messageId === message.id)
    .with(true, stop)
    .otherwise(() => void play(message));

  const latestReply = messages.filter((message) => message.role === 'assistant' && message.id !== CHAT.liveMessageId && roomsMessageText(message).trim()).at(-1);
  const latestEntryId = latestReply?.metadata?.entryId ?? 0;

  const setAutoRead = (isOn: boolean) => {
    heardEntryId.current = latestEntryId;
    setIsAutoRead(isOn);

    match(isOn)
      .with(true, () => void unlock())
      .with(false, stop)
      .exhaustive();
  };

  const readLatest = useEffectEvent(() => {
    if (!isAutoRead || isBusy || !latestReply || latestEntryId <= heardEntryId.current) {
      return;
    }

    heardEntryId.current = latestEntryId;
    void play(latestReply);
  });

  useEffect(() => readLatest(), [isAutoRead, isBusy, latestEntryId]);

  const release = useEffectEvent(stop);

  useEffect(() => () => {
    release();
    void audio.current?.close();
    audio.current = null;
  }, [botId]);

  return {
    isAvailable: isSupported && settings.data?.isConfigured === true,
    isAutoRead,
    playback,
    toggle,
    stop,
    setAutoRead,
  };
}

function useChatSpeechSubscribe() {
  return () => undefined;
}

function useChatSpeechIsSupported() {
  return Object.hasOwn(globalThis, 'AudioContext');
}
