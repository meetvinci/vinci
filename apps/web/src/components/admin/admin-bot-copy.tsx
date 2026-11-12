import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/dialog';
import { FormErrors } from '@repo/ui/forms/form';
import { toasty } from '@repo/ui/sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AdminBotChecklist } from '@/components/admin/admin-bot-checklist';
import { useAdminTemplateBots } from '@/hooks/use-admin-template-bots';
import { adminCopyBots } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminBotCopyProblem, adminProblem, adminRpcPrefix } from '@/services/admin/admin.utils';
import IconCopyPlus from '~icons/lucide/copy-plus';

interface AdminBotCopyProps {
  userId: string
}

export function AdminBotCopy({ userId }: AdminBotCopyProps) {
  const queryClient = useQueryClient();
  const { data: suggested = [] } = useAdminTemplateBots();
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const [problem, setProblem] = useState<string | null>(null);

  const copy = useMutation({
    mutationFn: adminCopyBots,
    onMutate: () => setProblem(null),
    onSuccess: async ({ bots }) => {
      await queryClient.invalidateQueries({ queryKey: [adminRpcPrefix(userId)] });
      const failed = adminBotCopyProblem({ copies: bots, bots: suggested });

      setSelected(bots.filter((bot) => bot.botId === null).map((bot) => bot.from));
      setProblem(failed);

      if (!failed) {
        toasty(m.admin_bots_copied(), '✅');
        setIsOpen(false);
      }
    },
  });

  if (userId === ADMIN.templateId) {
    return <p className="text-sm text-muted-foreground">{m.admin_global_bots_hint()}</p>;
  }

  if (suggested.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        className="self-end"
        size="sm"
        variant="outline"
        onClick={() => setIsOpen(true)}
      >
        <IconCopyPlus />
        {m.admin_bots_copy()}
      </Button>
      <Dialog open={isOpen} onOpenChange={(open) => !copy.isPending && setIsOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.admin_bots_copy()}</DialogTitle>
            <DialogDescription>{m.admin_bots_copy_hint()}</DialogDescription>
          </DialogHeader>
          <AdminBotChecklist
            bots={suggested}
            disabled={copy.isPending}
            label={m.admin_global_bots()}
            selected={selected}
            onToggle={(botId, isTicked) => setSelected((current) => (isTicked ? [...current, botId] : current.filter((id) => id !== botId)))}
          />
          <FormErrors error={copy.isError ? adminProblem({ error: copy.error, failed: m.admin_bots_copy_failed() }) : problem} />
          <DialogFooter>
            <Button
              disabled={copy.isPending}
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              {m.ui_cancel()}
            </Button>
            <ButtonLoading
              disabled={selected.length === 0}
              loading={copy.isPending}
              onClick={() => copy.mutate({ userId, bots: selected })}
            >
              {m.admin_bots_copy_submit()}
            </ButtonLoading>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
