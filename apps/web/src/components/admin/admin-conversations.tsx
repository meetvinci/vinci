import { roomsSearchSnippet } from '@repo/client/client';
import { useChatSearch, useRpc } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { getLocale } from '@repo/i18n/runtime';
import { BotAvatar } from '@repo/ui/bots/bot-avatar';
import { cn } from '@repo/ui/cn';
import { Input } from '@repo/ui/input';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemLink, ItemMedia, ItemTitle } from '@repo/ui/item';
import { Skeleton } from '@repo/ui/skeleton';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { AdminConversationNotice } from '@/components/admin/admin-conversation';
import { AdminUserGate } from '@/components/admin/admin-user';
import { adminUsersQuery } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminQueriesStatus } from '@/services/admin/admin.utils';
import type { RoomsSearchEntry, RoomsSearchHit } from '@repo/client/client';
import type { ReactNode } from 'react';

interface AdminConversationsProps {
  userId: string
  botId: string | undefined
  children: ReactNode
}

export function AdminConversations({ userId, botId, children }: AdminConversationsProps) {
  if (userId === ADMIN.templateId) {
    return <AdminConversationNotice description={m.admin_conversations_template_empty_hint()} title={m.admin_conversations_template_empty()} />;
  }

  return (
    <AdminConversationsPerson botId={botId} userId={userId}>
      {children}
    </AdminConversationsPerson>
  );
}

interface AdminConversationsPersonProps {
  userId: string
  botId: string | undefined
  children: ReactNode
}

function AdminConversationsPerson({ userId, botId, children }: AdminConversationsPersonProps) {
  const { rpc } = useRpc();
  const chats = useQuery(rpc.conversation.list.queryOptions());
  const { data: users } = useSuspenseQuery(adminUsersQuery());
  const person = users.find((user) => user.id === userId)?.name ?? userId;
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const { typed, isPending, results } = useChatSearch(query);

  return (
    <AdminUserGate status={adminQueriesStatus([chats])}>
      {chats.data?.length === 0 ? (
        <AdminConversationNotice description={m.admin_conversations_empty_hint()} title={m.admin_conversations_empty()} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{m.admin_conversations_hint()}</p>
          <div className="flex h-[calc(100svh-17rem)] min-h-112 overflow-hidden rounded-xl border">
            <div className={cn('flex w-full min-w-0 flex-col md:w-72 md:shrink-0 md:border-r', botId && 'max-md:hidden')}>
              <search className="border-b p-2">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setQuery(draft);
                  }}
                >
                  <Input
                    aria-label={m.admin_conversations_search()}
                    enterKeyHint="search"
                    placeholder={m.admin_conversations_search()}
                    type="search"
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);

                      if (!event.target.value) {
                        setQuery('');
                      }
                    }}
                  />
                </form>
              </search>
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {isPending && results.groups.length === 0 ? <AdminConversationsSkeleton /> : null}
                {typed && !isPending && results.chats.length === 0 && results.groups.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">{m.rooms_search_empty()}</p> : null}
                {results.chats.length > 0 ? (
                  <ItemGroup>
                    {results.chats.map((entry) => (
                      <AdminConversationsChat
                        entry={entry}
                        isCurrent={entry.chat.botId === botId}
                        key={entry.chat.botId}
                        userId={userId}
                      />
                    ))}
                  </ItemGroup>
                ) : null}
                {results.groups.map((group) => (
                  <section
                    aria-label={group.title}
                    className="mt-2"
                    key={group.chat.botId}
                  >
                    <h3 className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{group.title}</h3>
                    <ItemGroup>
                      {group.hits.map((hit) => (
                        <AdminConversationsHit
                          botId={group.chat.botId}
                          hit={hit}
                          key={hit.entryId}
                          name={group.title}
                          person={person}
                          query={typed}
                          userId={userId}
                        />
                      ))}
                    </ItemGroup>
                  </section>
                ))}
              </div>
            </div>
            <div className={cn('flex min-w-0 flex-1 flex-col', !botId && 'max-md:hidden')}>
              {botId ? children : <AdminConversationNotice description={m.admin_conversations_pick_hint()} title={m.admin_conversations_pick()} />}
            </div>
          </div>
        </div>
      )}
    </AdminUserGate>
  );
}

interface AdminConversationsChatProps {
  userId: string
  entry: RoomsSearchEntry
  isCurrent: boolean
}

function AdminConversationsChat({ userId, entry, isCurrent }: AdminConversationsChatProps) {
  const { chat } = entry;

  return (
    <Item className="flex-nowrap" size="sm">
      <ItemMedia>
        <BotAvatar
          animate={false}
          bot={{ name: chat.name, avatar: chat.avatar ?? undefined }}
          size={32}
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full justify-between">
          <ItemLink asChild>
            <Link
              aria-current={isCurrent ? 'page' : undefined}
              params={{ userId, botId: chat.botId }}
              search={{}}
              to="/admin/users/$userId/conversations/$botId"
            >
              {entry.title}
            </Link>
          </ItemLink>
          {chat.lastMessage ? <AdminConversationsTime at={chat.lastMessage.createdAt} /> : null}
        </ItemTitle>
        <ItemDescription>{chat.lastMessage?.preview ?? m.rooms_last_activity_none()}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

interface AdminConversationsHitProps {
  userId: string
  botId: string
  name: string
  person: string
  hit: RoomsSearchHit
  query: string
}

function AdminConversationsHit({ userId, botId, name, person, hit, query }: AdminConversationsHitProps) {
  return (
    <Item size="sm">
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full justify-between">
          <ItemLink asChild>
            <Link
              params={{ userId, botId }}
              search={{ message: hit.entryId }}
              to="/admin/users/$userId/conversations/$botId"
            >
              {hit.role === 'user' ? person : name}
            </Link>
          </ItemLink>
          <AdminConversationsTime at={hit.createdAt} />
        </ItemTitle>
        <ItemDescription>
          {roomsSearchSnippet({ text: hit.text, query }).map((part) => (part.match
            ? <mark className="bg-transparent font-semibold text-foreground underline decoration-foreground/50 decoration-2 underline-offset-2" key={part.start}>{part.text}</mark>
            : <span key={part.start}>{part.text}</span>))}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}

interface AdminConversationsTimeProps {
  at: number
}

function AdminConversationsTime({ at }: AdminConversationsTimeProps) {
  return (
    <time className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums" dateTime={new Date(at).toISOString()}>
      {new Date(at).toLocaleDateString(getLocale(), { dateStyle: 'medium' })}
    </time>
  );
}

function AdminConversationsSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-4 px-3 py-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="grid gap-1.5" key={index}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
