import { toolPresentation } from '@repo/client/client';
import { m } from '@repo/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CircleCheck } from 'lucide-react-native';
import { match } from 'ts-pattern';
import { BotDetailsSection } from '@/components/bots/bot-details-section';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { LabelDescription } from '@/components/ui/label';
import { CHAT_TOOL_ICONS } from '@/services/chat/chat.constants';
import type { RpcSession } from '@/types/rpc.types';
import type { Bot } from '@repo/contracts/universal';

interface BotSettingsAlwaysApprovedProps {
  bot: Bot;
  session: RpcSession;
}

export function BotSettingsAlwaysApproved({ bot, session }: BotSettingsAlwaysApprovedProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const options = session.rpc.tools.alwaysAllowed.queryOptions({ input: { botId: bot.id }, staleTime: 0 });
  const list = useQuery(options);
  const tools = list.data ?? [];

  const remove = useMutation(session.rpc.tools.clearAlwaysAllowed.mutationOptions({
    onSuccess: (remaining) => queryClient.setQueryData(options.queryKey, remaining),
  }));

  const problem = match({ isLoadFailed: list.isError, isChangeFailed: remove.isError })
    .with({ isLoadFailed: true }, () => m.bots_always_approved_load_failed())
    .with({ isChangeFailed: true }, () => m.bots_always_approved_failed())
    .otherwise(() => null);

  return (
    <BotDetailsSection
      icon={CircleCheck}
      title={m.bots_always_approved()}
    >
      <ItemGroup>
        <Item>
          <ItemContent>
            <ItemDescription numberOfLines={0}>
              {list.isSuccess && tools.length === 0 ? m.bots_always_approved_empty() : m.bots_always_approved_hint({ bot: bot.name })}
            </ItemDescription>
          </ItemContent>
        </Item>
        {tools.map((toolName) => {
          const presentation = toolPresentation({ toolName });

          return (
            <Item key={toolName}>
              <ItemMedia className="mt-1 self-start">
                <Icon icon={CHAT_TOOL_ICONS[presentation.icon]} tone="muted" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle numberOfLines={1}>{presentation.label}</ItemTitle>
                <ItemDescription numberOfLines={1}>{toolName}</ItemDescription>
              </ItemContent>
              <Button
                accessibilityLabel={m.bots_always_approved_remove_label({ tool: presentation.label })}
                disabled={remove.isPending}
                size="sm"
                variant="outline"
                onPress={() => remove.mutate({ botId: bot.id, toolName })}
              >
                {m.bots_always_approved_remove()}
              </Button>
            </Item>
          );
        })}
      </ItemGroup>
      {tools.length > 1 ? (
        <Button
          disabled={remove.isPending}
          size="sm"
          variant="outline"
          onPress={() => {
            remove.reset();
            router.push({ pathname: '/bots/[botId]/always-approved/clear', params: { botId: bot.id } });
          }}
        >
          {m.bots_always_approved_clear()}
        </Button>
      ) : null}
      {problem ? <LabelDescription accessibilityRole="alert" variant="error">{problem}</LabelDescription> : null}
    </BotDetailsSection>
  );
}
