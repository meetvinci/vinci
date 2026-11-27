import { m } from '@repo/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRpc } from './use-rpc';
import type { SettingsDoneParams } from '../types/settings.types';
import type { TranscriptionConfigureInput } from '@repo/contracts/universal';

export function useSettingsTranscription({ onDone }: SettingsDoneParams) {
  const queryClient = useQueryClient();
  const { rpc } = useRpc();

  const save = useMutation(rpc.transcription.configure.mutationOptions({
    meta: { success: m.settings_saved() },
    onSuccess: (saved) => {
      queryClient.setQueryData(rpc.transcription.settings.queryKey(), saved);
      onDone();
    },
  }));

  return {
    isPending: save.isPending,
    problem: save.isError ? m.settings_save_error() : null,
    save: (input: TranscriptionConfigureInput) => save.mutate(input),
  };
}
