import { artifactsStore } from '@repo/client/client';
import { useRpc } from '@repo/client/react';
import { ARTIFACT } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { ArtifactView } from '@repo/ui/artifact-view';
import { PreviewCard } from '@repo/ui/preview-card';
import { toasty } from '@repo/ui/sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { match, P } from 'ts-pattern';
import { AdminConversationArtifact } from '@/components/admin/admin-conversation-artifact';
import { ArtifactPane } from '@/components/artifacts/artifact-pane';
import { useSectionScope } from '@/hooks/use-section-scope';
import type { ToolCallArtifact } from '@repo/contracts/universal';

interface RoomsChatArtifactProps {
  artifact: ToolCallArtifact
}

export function RoomsChatArtifact({ artifact }: RoomsChatArtifactProps) {
  const { isAdmin } = useSectionScope();

  return isAdmin ? <AdminConversationArtifact artifact={artifact} /> : <RoomsChatArtifactLive artifact={artifact} />;
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
