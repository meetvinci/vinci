import { chatMessages, chatPairMessages, roomsMessageText } from '@repo/client/client';
import { chatQueries, useRpc } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { Message, MessageContent, MessageStack } from '@repo/ui/ai/message';
import { Response } from '@repo/ui/ai/response';
import { BotAvatar } from '@repo/ui/bots/bot-avatar';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Clamp } from '@repo/ui/clamp';
import { Pane, PaneBody, PaneContent, PaneHeader, PaneTitle } from '@repo/ui/pane';
import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import type { ToolBot } from '@repo/client/client';

interface RoomsHistoryPaneProps {
  botId: string
  bot: ToolBot
  conversationId: number
  name: string
  task?: string
  askerId?: string
  onOpenChange: (open: boolean) => void
}

export function RoomsHistoryPane({ botId, bot, conversationId, name, task, askerId, onOpenChange }: RoomsHistoryPaneProps) {
  const rpcs = useRpc();
  const { data: bots } = useSuspenseQuery(rpcs.rpc.bots.list.queryOptions());
  const owner = bots.find((item) => item.id === botId);

  const history = useInfiniteQuery({
    ...chatQueries.history(rpcs, {
      botId,
      conversationId,
      cursor: undefined,
    }),
    enabled: true,
  });

  const all = owner ? chatMessages({
    entries: [...(history.data?.pages.flatMap((page) => page.items) ?? [])].reverse(),
    bot: owner,
    bots,
  }) : [];

  const messages = (askerId ? chatPairMessages(all, askerId) : all).filter((message) => roomsMessageText(message));

  return (
    <Pane open onOpenChange={onOpenChange}>
      <PaneContent>
        <PaneHeader>
          <PaneTitle>{name}</PaneTitle>
        </PaneHeader>
        <PaneBody>
          {task ? (
            <div className="mb-4 text-xs text-muted-foreground">
              <Clamp size="sm">{task}</Clamp>
            </div>
          ) : null}
          {history.hasNextPage ? (
            <ButtonLoading
              className="mb-4 w-full"
              loading={history.isFetchingNextPage}
              size="xs"
              variant="outline"
              onClick={() => void history.fetchNextPage()}
            >
              {m.admin_conversations_older()}
            </ButtonLoading>
          ) : null}
          {messages.map((message) => {
            const isAsked = message.role === 'user' || message.parts.at(0)?.type === 'data-peerMessage';

            return (
              <Message from={isAsked ? 'user' : 'assistant'} key={message.id}>
                <MessageStack>
                  <MessageContent>
                    <Response renderHtml>{roomsMessageText(message)}</Response>
                  </MessageContent>
                </MessageStack>
                {isAsked ? null : <BotAvatar animate={false} bot={{ avatar: bot.avatar, name }} />}
              </Message>
            );
          })}
          {history.isSuccess && messages.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">{m.rooms_subagent_empty()}</p> : null}
          {history.isError ? <p className="py-6 text-center text-xs text-destructive" role="alert">{m.admin_conversations_failed()}</p> : null}
        </PaneBody>
      </PaneContent>
    </Pane>
  );
}
