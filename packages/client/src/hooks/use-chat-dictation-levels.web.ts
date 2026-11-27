import { useEffect, useState } from 'react';
import { TRANSCRIPTION_RECORDER } from '../services/transcription/transcription.constants';

const { waveform } = TRANSCRIPTION_RECORDER;

export function useChatDictationLevels(analyser: AnalyserNode | null) {
  const [levels, setLevels] = useState(() => Array.from({ length: waveform.bars }, () => 0));

  useEffect(() => {
    if (!analyser) {
      return undefined;
    }

    const samples = new Float32Array(analyser.fftSize);

    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const power = samples.reduce((sum, value) => sum + value * value, 0) / samples.length;
      const level = Math.min(1, Math.max(0, Math.sqrt(Math.sqrt(power)) * waveform.gain - waveform.floor));
      setLevels((current) => [...current.slice(1), level]);
    }, waveform.sampleMs);

    return () => clearInterval(timer);
  }, [analyser]);

  return {
    levels,
    meter: Math.round(Math.max(...levels.slice(-waveform.meterSamples)) * waveform.meterBars),
    meterBars: waveform.meterBars,
  };
}
