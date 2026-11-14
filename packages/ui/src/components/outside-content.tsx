import { htmlPagesRun } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { useMutation } from '@tanstack/react-query';
import { createContext, use, useEffect, useState, useSyncExternalStore } from 'react';
import IconShieldOff from '~icons/lucide/shield-off';
import { HTML_FRAME } from '../services/html/html.constants';
import { htmlPageKey } from '../services/html/html.utils';
import { Button } from './button';
import type { ReactNode } from 'react';

interface OutsideContentValue {
  isBlocked: boolean
  // The person's own app: a page that can reach outside waits for one click, remembered in this browser for that exact page.
  holdsPages?: boolean
  onAllow?: () => Promise<void>
  onBlocked?: () => void
}

const OutsideContentContext = createContext<OutsideContentValue>({ isBlocked: false, holdsPages: true });

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
        <OutsideContentNotice
          action={m.ui_outside_load()}
          isPending={allow.isPending}
          text={m.ui_outside_off()}
          onAction={() => allow.mutate()}
        />
      ) : null}
      {children}
    </OutsideContentContext>
  );
}

interface OutsideContentNoticeProps {
  text: string
  action: string
  isPending?: boolean
  onAction: () => void
}

export function OutsideContentNotice({ text, action, isPending = false, onAction }: OutsideContentNoticeProps) {
  return (
    <output className="mb-2 flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 text-xs text-muted-foreground">
      <IconShieldOff aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 text-pretty">{text}</span>
      <Button disabled={isPending} size="sm" variant="outline" onClick={onAction}>{action}</Button>
    </output>
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

function outsidePagesRun(): string[] {
  try {
    return htmlPagesRun.safeParse(localStorage.getItem(HTML_FRAME.runKey)).data ?? [];
  } catch {
    return [];
  }
}

function outsidePagesSubscribe(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);

  return () => window.removeEventListener('storage', onStoreChange);
}

interface OutsidePage {
  // Unknown until the browser's own record is read (server rendering and hydration).
  isHeld: boolean | undefined
  onRun: () => void
}

// The person's own app holds a page that can reach outside until they run it once; the admin's policy holds it itself.
export function useOutsidePage(html: string, hasOutside: boolean): OutsidePage {
  const { holdsPages } = use(OutsideContentContext);
  const key = htmlPageKey(html);
  const [runHere, setRunHere] = useState<string>();
  const isRun = useSyncExternalStore(outsidePagesSubscribe, () => outsidePagesRun().includes(key), () => undefined);

  const onRun = () => {
    setRunHere(key);

    try {
      localStorage.setItem(HTML_FRAME.runKey, JSON.stringify([...outsidePagesRun().filter((item) => item !== key), key].slice(-HTML_FRAME.runLimit)));
      window.dispatchEvent(new StorageEvent('storage', { key: HTML_FRAME.runKey }));
    } catch {
      // Storage is off in this browser: the page runs in this view only.
    }
  };

  if (holdsPages !== true || !hasOutside || runHere === key) {
    return { isHeld: false, onRun };
  }

  return { isHeld: isRun === undefined ? undefined : !isRun, onRun };
}
