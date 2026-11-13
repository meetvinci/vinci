import { ORPCError } from '@orpc/client';
import { useRpc } from '@repo/client/react';
import { ARTIFACT } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { getLocale } from '@repo/i18n/runtime';
import { messageSurface, messageTile } from '@repo/ui/ai/message';
import { ArtifactView } from '@repo/ui/artifact-view';
import { Button } from '@repo/ui/button';
import { cn } from '@repo/ui/cn';
import * as DropdownMenu from '@repo/ui/dropdown-menu';
import { Pane, PaneBody, PaneContent, PaneHeader, PaneTitle } from '@repo/ui/pane';
import { Skeleton } from '@repo/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { match, P } from 'ts-pattern';
import IconCheck from '~icons/lucide/check';
import IconChevronDown from '~icons/lucide/chevron-down';
import IconEye from '~icons/lucide/eye';
import IconHistory from '~icons/lucide/history';
import type { ToolCallArtifact } from '@repo/contracts/universal';

interface AdminConversationArtifactProps {
  artifact: ToolCallArtifact
}

export function AdminConversationArtifact({ artifact }: AdminConversationArtifactProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        data-message-wide
        className={cn(messageSurface, 'flex w-full min-w-0 cursor-pointer items-center gap-3 self-start px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring in-data-[slot=message-content]:rounded-xl')}
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <span className={messageTile}>{ARTIFACT.emojiDefault}</span>
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate text-sm font-medium">{artifact.title}</span>
          <span className="text-xs text-muted-foreground">{m.admin_conversations_artifact_kind({ version: artifact.version })}</span>
        </span>
      </button>
      {isOpen ? <AdminConversationArtifactPane artifact={artifact} onOpenChange={setIsOpen} /> : null}
    </>
  );
}

interface AdminConversationArtifactPaneProps {
  artifact: ToolCallArtifact
  onOpenChange: (open: boolean) => void
}

function AdminConversationArtifactPane({ artifact, onOpenChange }: AdminConversationArtifactPaneProps) {
  const { rpc } = useRpc();
  const [version, setVersion] = useState(artifact.version);
  const dates = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
  const ref = { botId: artifact.botId, conversationId: artifact.conversationId, artifactId: artifact.id };
  const shown = useQuery(rpc.artifacts.get.queryOptions({ input: { ...ref, version } }));
  const { data: versions = [] } = useQuery(rpc.artifacts.versions.queryOptions({ input: ref }));
  const isGone = shown.error instanceof ORPCError && shown.error.code === 'NOT_FOUND';

  return (
    <Pane open onOpenChange={onOpenChange}>
      <PaneContent>
        <PaneHeader>
          <PaneTitle icon={shown.data?.emoji ?? ARTIFACT.emojiDefault}>{shown.data?.title ?? artifact.title}</PaneTitle>
        </PaneHeader>
        <PaneBody size="wide">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <DropdownMenu.DropdownMenu>
              <DropdownMenu.DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <IconHistory />
                  {m.artifacts_versions({ version })}
                  <IconChevronDown />
                </Button>
              </DropdownMenu.DropdownMenuTrigger>
              <DropdownMenu.DropdownMenuContent align="start">
                {versions.map((item) => (
                  <DropdownMenu.DropdownMenuItem key={item.version} onSelect={() => setVersion(item.version)}>
                    {item.version === version ? <IconCheck className="size-4" /> : <IconHistory className="size-4" />}
                    <span className="flex-1">{m.artifacts_version_item({ version: item.version, date: dates.format(new Date(item.createdAt)) })}</span>
                    {item.version === artifact.version ? <span className="text-xs text-muted-foreground">{m.admin_conversations_artifact_this_message()}</span> : null}
                  </DropdownMenu.DropdownMenuItem>
                ))}
              </DropdownMenu.DropdownMenuContent>
            </DropdownMenu.DropdownMenu>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconEye aria-hidden className="size-3.5" />
              {m.admin_conversations_artifact_read_only()}
            </span>
          </div>
          {match(shown)
            .with({ data: P.nonNullable }, ({ data }) => (
              <ArtifactView
                key={data.version}
                spec={data.spec}
                title={data.title}
              />
            ))
            .with({ isPending: true }, () => <Skeleton className="h-64 w-full" />)
            .otherwise(() => <p className="text-sm text-muted-foreground" role="alert">{isGone ? m.admin_conversations_artifact_gone() : m.artifacts_error()}</p>)}
        </PaneBody>
      </PaneContent>
    </Pane>
  );
}
