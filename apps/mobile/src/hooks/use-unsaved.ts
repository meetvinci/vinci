import { m } from '@repo/i18n/client';
import { usePreventRemove } from 'expo-router';
import { actionSheetShow } from '@/components/ui/action-sheet';

export function useUnsaved(isDirty: boolean) {
  return usePreventRemove(isDirty, ({ repeat }) => actionSheetShow({
    title: m.mobile_bot_discard_title(),
    cancelLabel: m.mobile_bot_keep_editing(),
    choices: [{ label: m.mobile_bot_discard(), isDestructive: true, onSelect: repeat }],
  }));
}
