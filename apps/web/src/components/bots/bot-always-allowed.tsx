import { toolPresentation } from '@repo/client/client';
import { useRpc } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { FormErrors } from '@repo/ui/forms/form';
import { PanelContent, PanelDescription, PanelRow, PanelTitle } from '@repo/ui/panel';
import { SettingsConfirm } from '@repo/ui/settings/settings-confirm';
import { SettingsGroup } from '@repo/ui/settings/settings-group';
import { ToolIcon } from '@repo/ui/tools/tool-icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Bot } from '@repo/contracts/universal';

interface BotAlwaysAllowedProps {
  bot: Bot
}

export function BotAlwaysAllowed({ bot }: BotAlwaysAllowedProps) {
  const { rpc } = useRpc();
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const options = rpc.tools.alwaysAllowed.queryOptions({ input: { botId: bot.id }, staleTime: 0 });
  const list = useQuery(options);
  const tools = list.data ?? [];

  const clear = useMutation(rpc.tools.clearAlwaysAllowed.mutationOptions({
    onSuccess: (remaining) => {
      queryClient.setQueryData(options.queryKey, remaining);
      setIsConfirming(false);
    },
  }));

  const error = clear.isError ? m.bots_always_approved_failed() : null;
  const isEmpty = list.isSuccess && tools.length === 0;

  return (
    <SettingsGroup isTitleVisible title={m.bots_always_approved()}>
      <PanelRow>
        <PanelContent>
          <PanelDescription>{isEmpty ? m.bots_always_approved_empty() : m.bots_always_approved_hint({ bot: bot.name })}</PanelDescription>
        </PanelContent>
        {tools.length > 1 && !isConfirming ? (
          <Button
            disabled={clear.isPending}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              clear.reset();
              setIsConfirming(true);
            }}
          >
            {m.bots_always_approved_clear()}
          </Button>
        ) : null}
      </PanelRow>
      {isConfirming ? (
        <SettingsConfirm
          confirmLabel={m.bots_always_approved_clear()}
          description={m.bots_always_approved_clear_description({ bot: bot.name })}
          error={error}
          pending={clear.isPending}
          title={m.bots_always_approved_clear_title()}
          onCancel={() => setIsConfirming(false)}
          onConfirm={() => clear.mutate({ botId: bot.id })}
        />
      ) : null}
      {tools.map((toolName) => {
        const presentation = toolPresentation({ toolName });

        return (
          <PanelRow key={toolName}>
            <span aria-hidden className="text-muted-foreground [&>svg]:size-4">
              <ToolIcon icon={presentation.icon} />
            </span>
            <PanelContent>
              <PanelTitle className="truncate">{presentation.label}</PanelTitle>
              <PanelDescription className="truncate">{toolName}</PanelDescription>
            </PanelContent>
            <Button
              aria-label={m.bots_always_approved_remove_label({ tool: presentation.label })}
              disabled={clear.isPending}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => clear.mutate({ botId: bot.id, toolName })}
            >
              {m.bots_always_approved_remove()}
            </Button>
          </PanelRow>
        );
      })}
      {isConfirming ? null : <FormErrors error={list.isError ? m.bots_always_approved_load_failed() : error} />}
    </SettingsGroup>
  );
}
