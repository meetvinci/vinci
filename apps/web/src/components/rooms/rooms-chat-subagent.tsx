import { toolRunning } from '@repo/client/client';
import { useChatSubagent } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { Question, QuestionDescription, QuestionHeader, QuestionHeading, QuestionIcon, QuestionItem, QuestionList, QuestionTitle } from '@repo/ui/ai/question';
import { Button } from '@repo/ui/button';
import { useState } from 'react';
import { match } from 'ts-pattern';
import { RoomsHistoryPane } from '@/components/rooms/rooms-history-pane';
import { RoomsSubagentPane } from '@/components/rooms/rooms-subagent-pane';
import { useSectionScope } from '@/hooks/use-section-scope';
import IconLucideCheck from '~icons/lucide/check';
import IconLucideLoaderCircle from '~icons/lucide/loader-circle';
import IconLucideSquare from '~icons/lucide/square';
import IconLucideWorkflow from '~icons/lucide/workflow';
import IconLucideX from '~icons/lucide/x';
import type { ToolBot, ToolSubagent } from '@repo/client/client';
import type { DynamicToolUIPart } from 'ai';
import type { ReactNode } from 'react';

interface RoomsChatSubagentProps {
  botId: string
  bot: ToolBot
  part: DynamicToolUIPart
  subagent: ToolSubagent
}

export function RoomsChatSubagent(props: RoomsChatSubagentProps) {
  const { isAdmin } = useSectionScope();

  return isAdmin ? <RoomsChatSubagentHistory {...props} /> : <RoomsChatSubagentLive {...props} />;
}

interface RoomsChatSubagentHistoryProps {
  botId: string
  bot: ToolBot
  part: DynamicToolUIPart
  subagent: ToolSubagent
}

function RoomsChatSubagentHistory({ botId, bot, part, subagent }: RoomsChatSubagentHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <RoomsChatSubagentCard
      isFailed={part.state === 'output-error'}
      isRunning={toolRunning(part)}
      subagent={subagent}
      onOpen={subagent.conversationId ? () => setIsOpen(true) : undefined}
    >
      {isOpen && subagent.conversationId ? (
        <RoomsHistoryPane
          bot={bot}
          botId={botId}
          conversationId={subagent.conversationId}
          name={subagent.name ?? m.rooms_subagents_title()}
          task={subagent.message}
          onOpenChange={setIsOpen}
        />
      ) : null}
    </RoomsChatSubagentCard>
  );
}

interface RoomsChatSubagentLiveProps {
  botId: string
  bot: ToolBot
  part: DynamicToolUIPart
  subagent: ToolSubagent
}

function RoomsChatSubagentLive({ botId, bot, part, subagent }: RoomsChatSubagentLiveProps) {
  const [isOpen, setIsOpen] = useState(false);

  const live = useChatSubagent({
    botId,
    part,
    subagent,
  });

  return (
    <RoomsChatSubagentCard
      action={live.isRunning && subagent.conversationId ? (
        <Button
          aria-label={m.rooms_subagents_stop()}
          disabled={live.isStopping}
          size="icon-xs"
          title={m.rooms_subagents_stop()}
          variant="quiet"
          onClick={live.stop}
        >
          <IconLucideSquare />
        </Button>
      ) : undefined}
      isFailed={live.isFailed}
      isRunning={live.isRunning}
      subagent={subagent}
      onOpen={subagent.conversationId ? () => setIsOpen(true) : undefined}
    >
      {live.stopFailed ? <p className="px-1 text-xs text-destructive" role="alert">{m.rooms_subagents_stop_error()}</p> : null}
      {isOpen && subagent.conversationId ? (
        <RoomsSubagentPane
          bot={bot}
          botId={botId}
          conversationId={subagent.conversationId}
          name={subagent.name ?? m.rooms_subagents_title()}
          task={subagent.message}
          onOpenChange={setIsOpen}
        />
      ) : null}
    </RoomsChatSubagentCard>
  );
}

interface RoomsChatSubagentCardProps {
  subagent: ToolSubagent
  isRunning: boolean
  isFailed: boolean
  action?: ReactNode
  children?: ReactNode
  onOpen?: () => void
}

function RoomsChatSubagentCard({ subagent, isRunning, isFailed, action, children, onOpen }: RoomsChatSubagentCardProps) {
  const icon = match({ isFailed, isRunning })
    .with({ isFailed: true }, () => <IconLucideX className="text-destructive" />)
    .with({ isRunning: true }, () => <IconLucideLoaderCircle className="animate-spin motion-reduce:animate-none" />)
    .otherwise(() => <IconLucideCheck />);

  return (
    <Question className="w-md max-w-full">
      <QuestionHeader>
        <QuestionIcon>
          <IconLucideWorkflow />
        </QuestionIcon>
        <QuestionHeading>
          <QuestionTitle>{subagent.name ?? m.rooms_subagents_title()}</QuestionTitle>
          <QuestionDescription>{isRunning ? m.rooms_subagents_status_running() : m.rooms_subagents_status_completed()}</QuestionDescription>
        </QuestionHeading>
      </QuestionHeader>
      <QuestionList>
        <QuestionItem
          action={action}
          icon={icon}
          onClick={onOpen}
        >
          {subagent.message}
        </QuestionItem>
      </QuestionList>
      {children}
    </Question>
  );
}
