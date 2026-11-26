import { useClipboardCopy } from '@repo/client/web';
import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/dialog';
import { toasty } from '@repo/ui/sonner';
import IconCheck from '~icons/lucide/check';
import IconCopy from '~icons/lucide/copy';

interface AdminPasswordProps {
  title: string
  email: string
  password: string
  once?: string
  onDone: () => void
}

export function AdminPassword({ title, email, password, once = m.admin_password_once(), onDone }: AdminPasswordProps) {
  const clipboard = useClipboardCopy();

  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{m.admin_password_hint({ email })}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code aria-label={m.admin_password_label()} className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-sm select-all">{password}</code>
          <Button
            type="button"
            variant="outline"
            onClick={() => void clipboard.copy(password)
              .then(() => toasty(m.admin_password_copied(), '📋'))
              .catch(() => toasty(m.ui_copy_failed(), '🔴'))}
          >
            {clipboard.isCopied ? <IconCheck /> : <IconCopy />}
            {m.admin_password_copy()}
          </Button>
        </div>
        <p className="text-sm font-medium">{once}</p>
        <DialogFooter>
          <Button type="button" onClick={onDone}>{m.admin_password_done()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
