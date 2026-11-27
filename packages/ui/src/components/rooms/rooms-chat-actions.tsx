import { roomsMessageText } from '@repo/client/client';
import { useClipboardCopy, useIsTouch } from '@repo/client/web';
import { m } from '@repo/i18n/client';
import { useState } from 'react';
import { match } from 'ts-pattern';
import IconCheck from '~icons/lucide/check';
import IconCopy from '~icons/lucide/copy';
import IconEllipsisVertical from '~icons/lucide/ellipsis-vertical';
import IconInfo from '~icons/lucide/info';
import IconLoader from '~icons/lucide/loader-2';
import IconReply from '~icons/lucide/reply';
import IconSquare from '~icons/lucide/square';
import IconTextSelect from '~icons/lucide/text-select';
import IconVolume from '~icons/lucide/volume-2';
import { cn } from '../../lib/cn';
import { Button } from '../button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '../drawer';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { Separator } from '../separator';
import { toasty } from '../sonner';
import { RoomsChatEmojiChoices } from './rooms-chat-emoji-choices';
import { RoomsChatInfo } from './rooms-chat-info';
import { RoomsChatReactionPicker } from './rooms-chat-reaction-picker';
import type { ChatMessage } from '@repo/client/client';
import type { SpeechPhase } from '@repo/client/web';

interface RoomsChatActionsProps {
  message: ChatMessage
  sheet: boolean
  reacting?: boolean
  selectable?: boolean
  onSheetChange: (open: boolean) => void
  onReply?: () => void
  onReact?: (emoji: string) => void
  speech?: { phase: SpeechPhase, onToggle: () => void }
}

export function RoomsChatActions({
  message,
  sheet,
  reacting = false,
  selectable = false,
  onSheetChange,
  onReply,
  onReact,
  speech,
}: RoomsChatActionsProps) {
  const clipboard = useClipboardCopy();
  const [selecting, setSelecting] = useState(false);
  const touch = useIsTouch();

  const info = <RoomsChatInfo message={message} />;

  const copy = () => clipboard.copy(roomsMessageText(message));

  const fromSheet = (action: () => void) => {
    onSheetChange(false);
    action();
  };

  const speechLabel = match(speech?.phase)
    .with('loading', () => m.rooms_chat_speak_loading())
    .with('playing', () => m.rooms_chat_speak_stop())
    .otherwise(() => m.rooms_chat_speak());

  const speechIcon = (size: string) => match(speech?.phase)
    .with('loading', () => <IconLoader className={cn(size, 'animate-spin motion-reduce:animate-none')} />)
    .with('playing', () => <IconSquare className={size} />)
    .otherwise(() => <IconVolume className={size} />);

  const speechButton = speech ? (
    <Button
      aria-label={speechLabel}
      size="icon-xs"
      title={speechLabel}
      variant="quiet"
      onClick={speech.onToggle}
    >
      {speechIcon('size-3.5')}
    </Button>
  ) : null;

  return (
    <div className="flex shrink-0 items-center">
      {speech && speech.phase !== 'idle' ? speechButton : null}
      <div className="flex items-center opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus-within:opacity-100 has-data-[state=open]:opacity-100 motion-reduce:transition-none pointer-coarse:hidden">
        {onReact ? <RoomsChatReactionPicker disabled={reacting} onPick={onReact} /> : null}
        {onReply ? (
          <Button
            aria-label={m.rooms_chat_reply()}
            size="icon-xs"
            title={m.rooms_chat_reply()}
            variant="quiet"
            onClick={onReply}
          >
            <IconReply className={cn('size-3.5', message.role === 'user' && '-scale-x-100')} />
          </Button>
        ) : null}
        {speech?.phase === 'idle' ? speechButton : null}
        <Button
          aria-label={clipboard.isCopied ? m.rooms_chat_copied() : m.rooms_chat_copy()}
          size="icon-xs"
          title={m.rooms_chat_copy()}
          variant="quiet"
          onClick={() => void copy().catch(() => toasty(m.ui_copy_failed(), '🔴'))}
        >
          {clipboard.isCopied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-label={m.rooms_chat_info()}
              size="icon-xs"
              title={m.rooms_chat_info()}
              variant="quiet"
            >
              <IconInfo className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            arrow={false}
            className="w-64 p-3"
          >{info}</PopoverContent>
        </Popover>
      </div>
      {touch || sheet ? (
        <Drawer open={sheet} onOpenChange={onSheetChange}>
          <DrawerTrigger asChild>
            <Button
              aria-label={m.rooms_chat_actions()}
              size="icon-xs"
              variant="quiet"
            >
              <IconEllipsisVertical className="size-3.5" />
            </Button>
          </DrawerTrigger>
          <DrawerContent aria-describedby={undefined}>
            <DrawerTitle className="sr-only">{m.rooms_chat_actions()}</DrawerTitle>
            <div className="scrollbar flex flex-col gap-2 overflow-y-auto px-3 pt-3 pb-[max(--spacing(4),env(safe-area-inset-bottom))] [--scrollbar-thumb:color-mix(in_oklab,var(--muted-foreground)_20%,transparent)] [--scrollbar-track:transparent] scrollbar-h-1 scrollbar-thumb-rounded-full scrollbar-w-1">
              {onReact ? (
                <RoomsChatEmojiChoices
                  disabled={reacting}
                  layout="sheet"
                  onPick={(emoji) => fromSheet(() => onReact(emoji))}
                />
              ) : null}
              <div className="flex flex-col">
                {onReply ? (
                  <Button
                    className="justify-start"
                    size="lg"
                    variant="ghost"
                    onClick={() => fromSheet(onReply)}
                  >
                    <IconReply className="size-4 text-muted-foreground" />
                    {m.rooms_chat_reply()}
                  </Button>
                ) : null}
                {speech ? (
                  <Button
                    className="justify-start"
                    size="lg"
                    variant="ghost"
                    onClick={() => fromSheet(speech.onToggle)}
                  >
                    {speechIcon('size-4 text-muted-foreground')}
                    {speechLabel}
                  </Button>
                ) : null}
                <Button
                  className="justify-start"
                  size="lg"
                  variant="ghost"
                  onClick={() => fromSheet(() => void copy()
                    .then(() => toasty(m.rooms_chat_copied(), '📋'))
                    .catch(() => toasty(m.ui_copy_failed(), '🔴')))}
                >
                  <IconCopy className="size-4 text-muted-foreground" />
                  {m.rooms_chat_copy()}
                </Button>
                {selectable ? (
                  <Button
                    className="justify-start"
                    size="lg"
                    variant="ghost"
                    onClick={() => fromSheet(() => setSelecting(true))}
                  >
                    <IconTextSelect className="size-4 text-muted-foreground" />
                    {m.rooms_chat_select_text()}
                  </Button>
                ) : null}
              </div>
              <Separator />
              <div className="px-3 py-2">{info}</div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
      {selectable ? (
        <Drawer open={selecting} onOpenChange={setSelecting}>
          <DrawerContent aria-describedby={undefined} className="data-[vaul-drawer-direction=bottom]:h-[calc(var(--app-height)-env(safe-area-inset-top)-4rem)] data-[vaul-drawer-direction=bottom]:max-h-none">
            <DrawerHeader>
              <DrawerTitle>{m.rooms_chat_select_text()}</DrawerTitle>
            </DrawerHeader>
            <div
              data-vaul-no-drag
              className="scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-[max(--spacing(4),env(safe-area-inset-bottom))] text-sm leading-relaxed wrap-break-word whitespace-pre-wrap select-text [--scrollbar-thumb:color-mix(in_oklab,var(--muted-foreground)_20%,transparent)] [--scrollbar-track:transparent] scrollbar-h-1 scrollbar-thumb-rounded-full scrollbar-w-1"
            >
              {roomsMessageText(message)}
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );
}
