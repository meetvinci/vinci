import { m } from '@repo/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { match, P } from 'ts-pattern';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConnection } from '@/hooks/use-connection';
import type { RpcSession } from '@/types/rpc.types';

interface BotAlwaysApprovedClearDialogProps {
  botId: string;
}

export function BotAlwaysApprovedClearDialog(params: BotAlwaysApprovedClearDialogProps) {
  const { session } = useConnection();

  return match(session)
    .with(P.nonNullable, (current) => <BotAlwaysApprovedClearDialogContent params={params} session={current} />)
    .otherwise(() => null);
}

interface BotAlwaysApprovedClearDialogContentProps {
  session: RpcSession;
  params: BotAlwaysApprovedClearDialogProps;
}

function BotAlwaysApprovedClearDialogContent({ session, params: { botId } }: BotAlwaysApprovedClearDialogContentProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const bots = useQuery(session.rpc.bots.list.queryOptions());
  const bot = bots.data?.find((item) => item.id === botId)?.name ?? '';

  const clear = useMutation(session.rpc.tools.clearAlwaysAllowed.mutationOptions({
    onSuccess: (remaining) => {
      queryClient.setQueryData(session.rpc.tools.alwaysAllowed.queryKey({ input: { botId } }), remaining);
      router.back();
    },
  }));

  return (
    <ConfirmDialog
      isDestructive
      confirmLabel={m.bots_always_approved_clear()}
      description={m.bots_always_approved_clear_description({ bot })}
      error={clear.isError ? m.bots_always_approved_failed() : null}
      isPending={clear.isPending}
      title={m.bots_always_approved_clear_title()}
      onCancel={() => router.back()}
      onConfirm={() => clear.mutate({ botId })}
    />
  );
}
