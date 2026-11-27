import { useChatDictationLevels } from '@repo/client/web';
import { cn } from '@repo/ui/cn';

interface RoomsChatWaveformProps {
  analyser: AnalyserNode | null
}

export function RoomsChatWaveform({ analyser }: RoomsChatWaveformProps) {
  const { levels, meter, meterBars } = useChatDictationLevels(analyser);

  return (
    <span
      aria-hidden
      className="flex h-6 items-center"
    >
      <span className="flex h-full w-24 items-center gap-px motion-reduce:hidden">
        {levels.map((level, index) => (
          <span
            className="w-0.5 shrink-0 rounded-full bg-foreground/70"
            key={index}
            style={{ height: `${String(Math.max(8, Math.round(level * 100)))}%` }}
          />
        ))}
      </span>
      <span className="hidden h-4 items-end gap-0.5 motion-reduce:flex">
        {Array.from({ length: meterBars }, (_, index) => (
          <span
            className={cn('w-1 rounded-full', index < meter ? 'bg-foreground/70' : 'bg-muted-foreground/30')}
            key={index}
            style={{ height: `${String((index + 1) * (100 / meterBars))}%` }}
          />
        ))}
      </span>
    </span>
  );
}
