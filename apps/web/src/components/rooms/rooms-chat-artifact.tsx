import { artifactsStore } from '@repo/client/client';
import { useRpc } from '@repo/client/react';
import { ARTIFACT } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { messageSurface, messageTile } from '@repo/ui/ai/message';
import { ArtifactView } from '@repo/ui/artifact-view';
import { cn } from '@repo/ui/cn';
import { PreviewCard } from '@repo/ui/preview-card';
import { toasty } from '@repo/ui/sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { match, P } from 'ts-pattern';
import { ArtifactPane } from '@/components/artifacts/artifact-pane';
import { useSectionScope } from '@/hooks/use-section-scope';
import type { ToolCallArtifact } from '@repo/contracts/universal';

interface RoomsChatArtifactProps {
  artifact: ToolCallArtifact
}

export function RoomsChatArtifact({ artifact }: RoomsChatArtifactProps) {
  const { isAdmin } = useSectionScope();

  return isAdmin ? (
    <div data-message-wide className={cn(messageSurface, 'flex w-full min-w-0 items-center gap-3 self-start px-4 py-3 in-data-[slot=message-content]:rounded-xl')}>
      <span className={messageTile}>{ARTIFACT.emojiDefault}</span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium">{artifact.title}</span>
        <span className="text-xs text-muted-foreground">{m.admin_conversations_artifact_static()}</span>
      </span>
    </div>
  ) : <RoomsChatArtifactLive artifact={artifact} />;
}

interface RoomsChatArtifactLiveProps {
  artifact: ToolCallArtifact
}

function RoomsChatArtifactLive({ artifact }: RoomsChatArtifactLiveProps) {
  const { rpc } = useRpc();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const ref = { botId: artifact.botId, conversationId: artifact.conversationId, artifactId: artifact.id };
  const { data: saved } = useQuery(rpc.artifacts.get.queryOptions({ input: ref }));

  const store = artifactsStore({
    rpc,
    queryClient,
    botId: artifact.botId,
    conversationId: artifact.conversationId,
    artifactId: artifact.id,
    onError: () => toasty(m.artifacts_save_error(), '🔴'),
  });

  return (
    <>
      <PreviewCard
        icon={saved?.emoji ?? ARTIFACT.emojiDefault}
        kind={match(saved?.spec).with({ html: P.string }, () => m.ui_html_page()).otherwise(() => m.artifacts_kind())}
        label={m.artifacts_expand()}
        title={saved?.title ?? artifact.title}
        onOpen={() => setExpanded(true)}
      >
        {saved ? (
          <ArtifactView
            spec={saved.spec}
            store={store}
            title={saved.title}
          />
        ) : null}
      </PreviewCard>
      {expanded ? (
        <ArtifactPane
          artifactId={artifact.id}
          botId={artifact.botId}
          conversationId={artifact.conversationId}
          title={saved?.title ?? artifact.title}
          onOpenChange={setExpanded}
        />
      ) : null}
    </>
  );
}
