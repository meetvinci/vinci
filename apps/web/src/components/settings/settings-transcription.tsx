import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useRpc, useSettingsTranscription } from '@repo/client/react';
import { transcriptionSettingsForm } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Form, FormErrors } from '@repo/ui/forms/form';
import { FormInput } from '@repo/ui/forms/form-input';
import { PanelContent, PanelDescription, PanelRow, PanelTitle } from '@repo/ui/panel';
import { SettingsGroup } from '@repo/ui/settings/settings-group';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { LayoutUnsaved } from '@/components/layout/layout-unsaved';

interface SettingsTranscriptionProps {
  isReadOnly: boolean
}

export function SettingsTranscription({ isReadOnly }: SettingsTranscriptionProps) {
  const { rpc } = useRpc();
  const { data: settings } = useSuspenseQuery(rpc.transcription.settings.queryOptions());
  const form = useForm({ resolver: standardSchemaResolver(transcriptionSettingsForm), values: { apiKey: '' } });
  const save = useSettingsTranscription({ onDone: () => form.reset({ apiKey: '' }) });
  const status = settings.isConfigured ? m.settings_transcription_set() : m.settings_transcription_unset();

  if (isReadOnly) {
    return (
      <SettingsGroup title={m.settings_transcription()}>
        <PanelRow>
          <PanelContent>
            <PanelTitle>{m.settings_transcription_key()}</PanelTitle>
            <PanelDescription>{status}</PanelDescription>
          </PanelContent>
        </PanelRow>
      </SettingsGroup>
    );
  }

  return (
    <Form {...form}>
      <LayoutUnsaved isDirty={form.formState.isDirty} />
      <form onSubmit={form.handleSubmit(({ apiKey }) => save.save({ apiKey: apiKey || null }))}>
        <fieldset className="flex flex-col gap-4" disabled={save.isPending}>
          <SettingsGroup title={m.settings_transcription()}>
            <PanelRow className="items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <h3 className="text-sm font-medium">{m.settings_transcription_key()}</h3>
                <FormInput
                  aria-label={m.settings_transcription_key()}
                  autoComplete="off"
                  name="apiKey"
                  placeholder={settings.isConfigured ? m.settings_secret_saved() : m.settings_transcription_placeholder()}
                  type="password"
                />
                <PanelDescription>{m.settings_transcription_hint()}</PanelDescription>
                <PanelDescription>{status}</PanelDescription>
              </div>
            </PanelRow>
          </SettingsGroup>
          <div className="flex items-center justify-end gap-2">
            <FormErrors className="mr-auto" error={save.problem} />
            {settings.isConfigured ? (
              <Button
                disabled={save.isPending}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => save.save({ apiKey: null })}
              >
                {m.settings_transcription_remove()}
              </Button>
            ) : null}
            <ButtonLoading
              disabled={save.isPending || !form.formState.isDirty}
              loading={save.isPending}
              size="sm"
              type="submit"
            >
              {m.settings_save()}
            </ButtonLoading>
          </div>
        </fieldset>
      </form>
    </Form>
  );
}
