import { TRANSCRIPTION } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { match, P } from 'ts-pattern';
import { TRANSCRIPTION_RECORDER } from '../services/transcription/transcription.constants';
import { transcriptionProblem } from '../services/transcription/transcription.utils';
import { useRpc } from './use-rpc';
import type { TranscriptionDictationParams, TranscriptionRecording, TranscriptionState } from '../types/transcription.types';

export function useChatDictation({ botId, onText, onProblem }: TranscriptionDictationParams) {
  const { rpc } = useRpc();
  const settings = useQuery(rpc.transcription.settings.queryOptions());
  const transcribe = useMutation(rpc.transcription.transcribe.mutationOptions());
  const [state, setState] = useState<TranscriptionState>('idle');
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const recording = useRef<TranscriptionRecording | null>(null);
  const generation = useRef(0);
  const isSupported = useSyncExternalStore(useChatDictationSubscribe, useChatDictationIsSupported, () => false);

  const finish = (current: TranscriptionRecording) => {
    current.stream.getTracks().forEach((track) => track.stop());
    recording.current = null;

    if (!current.shouldTranscribe || current.generation !== generation.current) {
      setState('idle');

      return;
    }

    const file = new File(current.chunks, `recording.${current.format.extension}`, { type: current.format.type.split(';', 1)[0] });

    if (file.size > TRANSCRIPTION.maxBytes) {
      setState('idle');
      onProblem(m.rooms_chat_dictate_too_large());

      return;
    }

    setState('transcribing');
    transcribe.mutate({ file }, {
      onSuccess: ({ text }) => match({ text: text.trim(), isCurrent: current.generation === generation.current })
        .with({ isCurrent: false }, () => undefined)
        .with({ text: '' }, () => onProblem(m.rooms_chat_dictate_empty()))
        .otherwise(({ text: value }) => onText(value)),
      onError: (error) => match(current.generation === generation.current)
        .with(true, () => onProblem(transcriptionProblem(error)))
        .otherwise(() => undefined),
      onSettled: () => setState('idle'),
    });
  };

  const end = (shouldTranscribe: boolean) => {
    const current = recording.current;

    if (!current) {
      return;
    }

    current.shouldTranscribe = shouldTranscribe;
    current.recorder.stop();
  };

  const start = async () => {
    if (state !== 'idle') {
      return;
    }

    setState('starting');
    const started = generation.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (started !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        setState('idle');

        return;
      }

      const format = TRANSCRIPTION_RECORDER.formats.find(({ type }) => MediaRecorder.isTypeSupported(type)) ?? TRANSCRIPTION_RECORDER.formats[0];
      const recorder = new MediaRecorder(stream, { mimeType: format.type, audioBitsPerSecond: TRANSCRIPTION_RECORDER.bitsPerSecond });
      const current: TranscriptionRecording = { recorder, stream, format, generation: started, chunks: [], shouldTranscribe: false };

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          current.chunks.push(event.data);
        }
      });
      recorder.addEventListener('stop', () => finish(current));
      recording.current = current;
      recorder.start(TRANSCRIPTION_RECORDER.chunkMs);
      setStartedAt(Date.now());
      setNow(Date.now());
      setState('recording');
    } catch (error) {
      setState('idle');
      onProblem(match(error)
        .with({ name: P.union('NotAllowedError', 'SecurityError') }, () => m.rooms_chat_dictate_denied())
        .with({ name: P.union('NotFoundError', 'OverconstrainedError') }, () => m.rooms_chat_dictate_no_microphone())
        .otherwise(() => m.rooms_chat_dictate_microphone_failed()));
    }
  };

  const tick = useEffectEvent(() => {
    setNow(Date.now());

    if (Date.now() - startedAt >= TRANSCRIPTION.maxDurationMs) {
      onProblem(m.rooms_chat_dictate_limit({ minutes: TRANSCRIPTION.maxDurationMs / 60_000 }));
      end(true);
    }
  });

  const cancelOnEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    end(false);
  });

  const release = useEffectEvent(() => end(false));

  useEffect(() => {
    if (state !== 'recording') {
      return undefined;
    }

    const timer = setInterval(tick, TRANSCRIPTION_RECORDER.tickMs);
    const listener = (event: KeyboardEvent) => cancelOnEscape(event);
    window.addEventListener('keydown', listener);

    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', listener);
    };
  }, [state]);

  useEffect(() => () => {
    generation.current += 1;
    release();
  }, [botId]);

  return {
    isAvailable: isSupported && settings.data?.isConfigured === true,
    state,
    elapsedSeconds: state === 'recording' ? Math.floor((now - startedAt) / 1000) : 0,
    start: () => void start(),
    stop: () => end(true),
    cancel: () => end(false),
  };
}

function useChatDictationSubscribe() {
  return () => undefined;
}

function useChatDictationIsSupported() {
  return window.isSecureContext && Object.hasOwn(globalThis, 'MediaRecorder');
}
