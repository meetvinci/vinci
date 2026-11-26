import { m } from '@repo/i18n/client';
import { ConfirmationDialog } from '@repo/ui/alert-dialog';
import { useBlocker } from '@tanstack/react-router';

interface LayoutUnsavedProps {
  isDirty: boolean
  path?: string
}

export function LayoutUnsaved({ isDirty, path }: LayoutUnsavedProps) {
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) => path === undefined || (next.pathname !== path && !next.pathname.startsWith(`${path}/`)),
    disabled: !isDirty,
    enableBeforeUnload: isDirty,
    withResolver: true,
  });

  return blocker.status === 'blocked' ? (
    <ConfirmationDialog
      confirmLabel={m.layout_unsaved_leave()}
      pending={false}
      title={m.layout_unsaved_title()}
      variant="destructive"
      onConfirm={blocker.proceed}
      onOpenChange={blocker.reset}
    >
      {m.layout_unsaved_description()}
    </ConfirmationDialog>
  ) : null;
}
