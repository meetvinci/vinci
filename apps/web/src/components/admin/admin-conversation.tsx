import { chatEntryIds, chatMessages } from '@repo/client/client';
import { chatQueries, useChatAround, useRpc } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { Badge } from '@repo/ui/badge';
import { BotAvatar } from '@repo/ui/bots/bot-avatar';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@repo/ui/empty';
import { MessageScrollerProvider } from '@repo/ui/message-scroller';
import { OutsideContentPolicy } from '@repo/ui/outside-content';
import { Skeleton } from '@repo/ui/skeleton';
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useTransition } from 'react';
import { match, P } from 'ts-pattern';
import { AdminConversationWaiting } from '@/components/admin/admin-conversation-waiting';
import { RoomsChatTranscript } from '@/components/rooms/rooms-chat-transcript';
import { adminLoadOutside } from '@/services/admin/admin.client';
import { adminConversationWaiting, adminQueriesStatus } from '@/services/admin/admin.utils';
import IconArrowLeft from '~icons/lucide/arrow-left';
import IconEye from '~icons/lucide/eye';
import IconRefreshCw from '~icons/lucide/refresh-cw';
import type { Bot } from '@repo/contracts/universal';

interface AdminConversationProps {
  userId: string
  botId: string
  entryId: number | undefined
}

export function AdminConversation({ userId, botId, entryId }: AdminConversationProps) {
  const { rpc } = useRpc();
  const queryClient = useQueryClient();
  const [isRefreshing, startRefresh] = useTransition();
  const chats = useQuery(rpc.conversation.list.queryOptions());
  const bots = useQuery(rpc.bots.list.queryOptions());
  const chat = chats.data?.find((item) => item.botId === botId);
  const bot = bots.data?.find((item) => item.id === botId);

  const refresh = () => startRefresh(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: rpc.conversation.key() }),
      queryClient.invalidateQueries({ queryKey: rpc.tools.pending.key() }),
      queryClient.invalidateQueries({ queryKey: rpc.artifacts.key() }),
      queryClient.invalidateQueries({ queryKey: rpc.bots.list.key() }),
    ]);
  });

  const loadOutside = (conversationId: number) => adminLoadOutside({
    userId,
    botId,
    conversationId,
  });

  const header = (
    <header className="flex items-center gap-3 border-b px-3 py-2 md:px-4">
      <Button
        asChild
        aria-label={m.admin_conversations_back()}
        className="md:hidden"
        size="icon-sm"
        variant="ghost"
      >
        <Link params={{ userId }} to="/admin/users/$userId/conversations">
          <IconArrowLeft />
        </Link>
      </Button>
      {bot ? (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <BotAvatar
            animate={false}
            bot={bot}
            size={32}
          />
          <span className="grid min-w-0 leading-tight">
            <span className="truncate text-sm font-medium">{bot.name}</span>
            <span className="truncate text-xs text-muted-foreground">@{bot.handle}</span>
          </span>
        </span>
      ) : <span className="flex-1" />}
      <Badge variant="outline-secondary">
        <IconEye aria-hidden />
        {m.admin_conversations_read_only()}
      </Badge>
      <ButtonLoading
        aria-label={m.admin_conversations_refresh()}
        loading={isRefreshing}
        size="sm"
        variant="outline"
        onClick={refresh}
      >
        <IconRefreshCw />
        <span className="max-sm:sr-only">{m.admin_conversations_refresh()}</span>
      </ButtonLoading>
    </header>
  );

  const body = match({
    status: adminQueriesStatus([chats, bots]),
    chat,
    bot,
  })
    .with({ status: 'pending' }, () => <AdminConversationSkeleton />)
    .with({ status: 'error' }, () => <AdminConversationNotice description={m.admin_user_unreachable_hint()} title={m.admin_conversations_failed()} />)
    .with({ chat: P.nonNullable, bot: P.nonNullable }, (found) => (found.chat.lastMessage ? (
      <OutsideContentPolicy onAllow={() => loadOutside(found.chat.conversationId)}>
        <MessageScrollerProvider key={`${userId}:${botId}:${entryId ?? 'latest'}`}>
          {entryId === undefined ? (
            <AdminConversationLatest
              bot={found.bot}
              bots={bots.data ?? []}
              conversationId={found.chat.conversationId}
            />
          ) : (
            <AdminConversationAround
              bot={found.bot}
              bots={bots.data ?? []}
              conversationId={found.chat.conversationId}
              entryId={entryId}
              userId={userId}
            />
          )}
        </MessageScrollerProvider>
      </OutsideContentPolicy>
    ) : <AdminConversationNotice description={m.admin_conversations_no_messages_hint()} title={m.admin_conversations_no_messages()} />))
    .otherwise(() => <AdminConversationNotice description={m.admin_conversations_missing_hint()} title={m.admin_conversations_missing()} />);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
    </div>
  );
}

interface AdminConversationLatestProps {
  bot: Bot
  bots: Bot[]
  conversationId: number
}

function AdminConversationLatest({ bot, bots, conversationId }: AdminConversationLatestProps) {
  const rpcs = useRpc();

  const history = useInfiniteQuery({
    ...chatQueries.history(rpcs, {
      botId: bot.id,
      conversationId,
      cursor: undefined,
    }),
    enabled: true,
  });

  const { data: pending = [] } = useQuery(rpcs.rpc.tools.pending.queryOptions({ input: { botId: bot.id } }));
  const { data: questions = [] } = useQuery(rpcs.rpc.conversation.questions.queryOptions({ input: { botId: bot.id, conversationId } }));
  const approvals = pending.filter((approval) => approval.conversationId === conversationId || approval.privateWith !== null);

  const messages = adminConversationWaiting(chatMessages({
    entries: [...(history.data?.pages.flatMap((page) => page.items) ?? [])].reverse(),
    bot,
    bots,
  }), approvals);

  const reactions = useQueries({
    queries: (history.data?.pages ?? []).map((page) => rpcs.rpc.conversation.reactions.queryOptions({
      input: {
        botId: bot.id,
        conversationId,
        entryIds: chatEntryIds(chatMessages({
          entries: [...page.items].reverse(),
          bot,
          bots,
        })),
      },
    })),
    combine: (results) => new Map(results.flatMap((result) => result.data ?? []).map((reaction) => [reaction.entryId, reaction])),
  });

  return match(history)
    .with({ isPending: true }, () => <AdminConversationSkeleton />)
    .with({ isError: true }, () => <AdminConversationNotice description={m.admin_user_unreachable_hint()} title={m.admin_conversations_failed()} />)
    .otherwise(() => (
      <RoomsChatTranscript
        isReadOnly
        bot={bot}
        bots={bots}
        focusedEntryId={undefined}
        footer={approvals.length + questions.length > 0 ? (
          <AdminConversationWaiting
            approvals={approvals}
            bot={bot}
            bots={bots}
            questions={questions}
          />
        ) : undefined}
        messages={messages}
        older={{ isEnabled: history.hasNextPage, isLoading: history.isFetchingNextPage, onLoad: () => void history.fetchNextPage() }}
        reactions={reactions}
        onReply={() => undefined}
      />
    ));
}

interface AdminConversationAroundProps {
  bot: Bot
  bots: Bot[]
  conversationId: number
  userId: string
  entryId: number
}

function AdminConversationAround({ userId, bot, bots, conversationId, entryId }: AdminConversationAroundProps) {
  const navigate = useNavigate();

  const around = useChatAround({
    bot,
    bots,
    conversationId,
    interactionsRevision: 0,
    entryId,
  });

  const { isLatest } = around;

  useEffect(() => {
    if (isLatest) {
      void navigate({
        to: '/admin/users/$userId/conversations/$botId',
        params: { userId, botId: bot.id },
        search: {},
        replace: true,
      });
    }
  }, [bot.id, isLatest, navigate, userId]);

  return around.isReady ? (
    <RoomsChatTranscript
      isReadOnly
      bot={bot}
      bots={bots}
      focusedEntryId={entryId}
      messages={around.messages}
      newer={around.newer}
      older={around.older}
      reactions={around.reactions}
      onReply={() => undefined}
    />
  ) : <AdminConversationSkeleton />;
}

function AdminConversationSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <Skeleton className="h-10 w-2/3 self-end" />
      <Skeleton className="h-24 w-4/5" />
      <Skeleton className="h-10 w-1/2 self-end" />
      <Skeleton className="h-16 w-3/4" />
    </div>
  );
}

interface AdminConversationNoticeProps {
  title: string
  description: string
}

export function AdminConversationNotice({ title, description }: AdminConversationNoticeProps) {
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
