import { useMutation } from '@tanstack/react-query';
import { useEffect, useEffectEvent } from 'react';
import { match } from 'ts-pattern';
import { useRpc } from './use-rpc';

export function useBotOpen(botId: string, isMain: boolean) {
  const { rpc } = useRpc();
  const open = useMutation(rpc.bots.open.mutationOptions());

  const opened = useEffectEvent(() => match(isMain)
    .with(true, () => open.mutate({ botId }))
    .with(false, () => undefined)
    .exhaustive());

  useEffect(() => {
    opened();
  }, [botId]);
}
