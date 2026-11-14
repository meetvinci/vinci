import { ORPCError } from '@orpc/client';
import { m } from '@repo/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { match } from 'ts-pattern';
import { botHandle } from '../services/bot/bot.utils';
import { useRpc } from './use-rpc';
import type { BotCreateParams } from '../types/bot.types';
import type { BotForm } from '@repo/contracts/universal';

export function useBotCreate({ onCreated }: BotCreateParams) {
  const queryClient = useQueryClient();
  const { rpc } = useRpc();

  const create = useMutation(rpc.bots.create.mutationOptions({
    onSuccess: async (bot) => {
      await queryClient.invalidateQueries({ queryKey: rpc.bots.list.key() });
      onCreated(bot);
    },
  }));

  return {
    isPending: create.isPending,
    problem: botCreateProblem(create.error),
    create: (input: BotForm) => create.mutate({ ...input, handle: input.handle === '' ? botHandle({ name: input.name }) : input.handle }),
  };
}

function botCreateProblem(error: Error | null) {
  return match(error)
    .with(null, () => null)
    .when((value) => value instanceof ORPCError && value.code === 'DISK_FULL', () => m.rooms_bot_create_disk_full())
    .otherwise(() => m.rooms_bot_create_error());
}
