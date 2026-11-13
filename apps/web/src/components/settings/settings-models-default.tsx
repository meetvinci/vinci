import { botFallbackModel } from '@repo/client/client';
import { useRpc } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { PanelContent, PanelDescription, PanelRow } from '@repo/ui/panel';
import { SettingsGroup } from '@repo/ui/settings/settings-group';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { BotSettingsFields } from '@/components/bots/bot-settings-fields';
import type { ModelDefault } from '@repo/contracts/universal';

export function SettingsModelsDefault() {
  const { rpc } = useRpc();
  const queryClient = useQueryClient();
  const { data: { defaultModel } } = useSuspenseQuery(rpc.models.settings.queryOptions());

  const configure = useMutation(rpc.models.configure.mutationOptions({
    meta: { error: m.settings_save_failed() },
    onSuccess: (saved) => queryClient.setQueryData(rpc.models.settings.queryKey(), saved),
  }));

  const save = (next: ModelDefault) => configure.mutate({ defaultModel: { ...next, fallbackModel: botFallbackModel(next) } });

  return (
    <SettingsGroup isTitleVisible title={m.settings_models_default()}>
      <PanelRow className="block">
        <div className="flex flex-col gap-3">
          <PanelContent>
            <PanelDescription>{m.settings_models_default_hint()}</PanelDescription>
          </PanelContent>
          <BotSettingsFields
            disabled={configure.isPending}
            fallback={defaultModel ? {
              value: defaultModel.fallbackModel,
              onChange: (fallbackModel) => save({ ...defaultModel, fallbackModel }),
            } : undefined}
            value={defaultModel ?? { modelProvider: '', modelId: '', thinkingLevel: 'medium' }}
            onChange={(next) => save({ ...next, fallbackModel: defaultModel?.fallbackModel ?? null })}
          />
          {defaultModel ? (
            <div>
              <Button
                disabled={configure.isPending}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => configure.mutate({ defaultModel: null })}
              >
                {m.settings_models_default_clear()}
              </Button>
            </div>
          ) : null}
        </div>
      </PanelRow>
    </SettingsGroup>
  );
}
