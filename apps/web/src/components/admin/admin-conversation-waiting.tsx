import { roomsApprovalText, roomsChoice, roomsQuestionHint, roomsQuestionText, toolPresentation } from '@repo/client/client';
import { m } from '@repo/i18n/client';
import { EventLabel, EventLine, EventList } from '@repo/ui/ai/event';
import { messageList, messageRow } from '@repo/ui/ai/message';
import { Question, QuestionDescription, QuestionHeader, QuestionHeading, QuestionTitle } from '@repo/ui/ai/question';
import { ToolCodeBlock } from '@repo/ui/ai/tool';
import { Badge } from '@repo/ui/badge';
import { BotMention } from '@repo/ui/bots/bot-mention';
import { MessageScrollerItem } from '@repo/ui/message-scroller';
import { ToolInput } from '@repo/ui/tools/tool-input';
import { Fragment } from 'react';
import IconHourglass from '~icons/lucide/hourglass';
import type { Bot, ConversationQuestion, ToolApproval } from '@repo/contracts/universal';

interface AdminConversationWaitingProps {
  bot: Bot
  bots: Bot[]
  approvals: ToolApproval[]
  questions: ConversationQuestion[]
}

export function AdminConversationWaiting({ bot, bots, approvals, questions }: AdminConversationWaitingProps) {
  const source = (privateWith: string | null) => {
    const peer = bots.find((item) => item.id === privateWith);

    return peer ? (
      <EventList>
        <EventLine>
          <EventLabel>{m.rooms_event_private_source()}</EventLabel>
          <BotMention bot={peer} />
        </EventLine>
      </EventList>
    ) : null;
  };

  return (
    <MessageScrollerItem>
      {questions.map((question) => (
        <Fragment key={`question-${question.id}`}>
          {source(question.privateWith)}
          <AdminConversationWaitingQuestion botName={bot.name} question={question} />
        </Fragment>
      ))}
      {approvals.map((approval) => (
        <Fragment key={`approval-${approval.id}`}>
          {source(approval.privateWith)}
          <AdminConversationWaitingApproval approval={approval} botName={bot.name} />
        </Fragment>
      ))}
      <div className="min-h-8" />
    </MessageScrollerItem>
  );
}

interface AdminConversationWaitingBadgeProps {
  label: string
}

function AdminConversationWaitingBadge({ label }: AdminConversationWaitingBadgeProps) {
  return (
    <Badge className="self-start" variant="outline-secondary">
      <IconHourglass aria-hidden />
      {label}
    </Badge>
  );
}

interface AdminConversationWaitingApprovalProps {
  approval: ToolApproval
  botName: string
}

function AdminConversationWaitingApproval({ approval, botName }: AdminConversationWaitingApprovalProps) {
  const text = roomsApprovalText({ input: approval.arguments });

  return (
    <Question className="my-2">
      <AdminConversationWaitingBadge label={m.admin_conversations_waiting_approval()} />
      <QuestionHeader>
        <QuestionHeading>
          <QuestionTitle title={approval.toolName}>{toolPresentation({ toolName: approval.toolName }).label}</QuestionTitle>
          {text.description ? <QuestionDescription>{text.description}</QuestionDescription> : null}
          <QuestionDescription>{m.admin_conversations_waiting_approval_hint({ bot: botName })}</QuestionDescription>
        </QuestionHeading>
      </QuestionHeader>
      {text.code ? <ToolCodeBlock>{text.code}</ToolCodeBlock> : <ToolInput input={approval.arguments} />}
    </Question>
  );
}

interface AdminConversationWaitingQuestionProps {
  question: ConversationQuestion
  botName: string
}

function AdminConversationWaitingQuestion({ question, botName }: AdminConversationWaitingQuestionProps) {
  const text = roomsQuestionText({ question: question.text });

  return (
    <Question className="my-2">
      <AdminConversationWaitingBadge label={m.admin_conversations_waiting_answer()} />
      <QuestionHeader>
        <QuestionHeading>
          <QuestionTitle>{text.title}</QuestionTitle>
          {text.detail ? <QuestionDescription>{text.detail}</QuestionDescription> : null}
          <QuestionDescription>{roomsQuestionHint({ question })}</QuestionDescription>
          <QuestionDescription>{m.admin_conversations_waiting_answer_hint({ bot: botName })}</QuestionDescription>
        </QuestionHeading>
      </QuestionHeader>
      {question.choices.length > 0 ? (
        <ul aria-label={question.text} className={messageList}>
          {question.choices.map((choice, index) => {
            const { label, recommended } = roomsChoice({ choice });

            return (
              <li className={messageRow} key={choice}>
                <span aria-hidden="true" className="flex-center size-6 shrink-0 rounded-md border text-xs font-medium tabular-nums">{String.fromCodePoint(65 + index)}</span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 wrap-break-word whitespace-pre-line">
                  {label}
                  {recommended ? <Badge variant="outline">{m.rooms_chat_question_recommended()}</Badge> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Question>
  );
}
