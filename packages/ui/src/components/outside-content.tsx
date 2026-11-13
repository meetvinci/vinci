import { m } from '@repo/i18n/client';
import { useMutation } from '@tanstack/react-query';
import { createContext, use, useEffect, useState } from 'react';
import IconShieldOff from '~icons/lucide/shield-off';
import { Button } from './button';
import type { ReactNode } from 'react';

interface OutsideContentValue {
  isBlocked: boolean
  onAllow?: () => Promise<void>
  onBlocked?: () => void
}

const OutsideContentContext = createContext<OutsideContentValue>({ isBlocked: false });

interface OutsideContentPolicyProps {
  onAllow: () => Promise<void>
  children: ReactNode
}

// Nothing below loads from another origin until a guard lets its own content do so after `onAllow` resolves.
export function OutsideContentPolicy({ onAllow, children }: OutsideContentPolicyProps) {
  return <OutsideContentContext value={{ isBlocked: true, onAllow }}>{children}</OutsideContentContext>;
}

// One artifact or message. Outside a policy, or inside another guard, it renders its children as they are.
export function OutsideContentGuard({ children }: { children: ReactNode }) {
  const parent = use(OutsideContentContext);

  return parent.isBlocked && !parent.onBlocked ? <OutsideContentGate onAllow={parent.onAllow}>{children}</OutsideContentGate> : children;
}

function OutsideContentGate({ onAllow, children }: Pick<OutsideContentValue, 'onAllow'> & { children: ReactNode }) {
  const [hasBlocked, setBlocked] = useState(false);
  const allow = useMutation({ mutationFn: async () => onAllow?.() });

  return (
    <OutsideContentContext value={allow.isSuccess ? { isBlocked: false } : { isBlocked: true, onBlocked: () => setBlocked(true) }}>
      {hasBlocked && !allow.isSuccess ? (
        <output className="mb-2 flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 text-xs text-muted-foreground">
          <IconShieldOff aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 text-pretty">{m.ui_outside_off()}</span>
          <Button
            disabled={allow.isPending}
            size="sm"
            variant="outline"
            onClick={() => allow.mutate()}
          >{m.ui_outside_load()}
          </Button>
        </output>
      ) : null}
      {children}
    </OutsideContentContext>
  );
}

// True while outside content is off here; reports `hasOutside` to the nearest guard so it can show its notice.
export function useOutsideContent(hasOutside: boolean): boolean {
  const { isBlocked, onBlocked } = use(OutsideContentContext);
  const isHeld = isBlocked && hasOutside;

  useEffect(() => {
    if (isHeld) {
      onBlocked?.();
    }
  }, [isHeld, onBlocked]);

  return isBlocked;
}
