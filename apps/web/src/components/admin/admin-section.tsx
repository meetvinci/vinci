import { m } from '@repo/i18n/client';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/alert';
import { ConfirmationDialog } from '@repo/ui/alert-dialog';
import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { match } from 'ts-pattern';
import { useAdminSectionMode } from '@/hooks/use-admin-section-mode';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminProblem, adminSectionLabel } from '@/services/admin/admin.utils';
import IconTriangleAlert from '~icons/lucide/triangle-alert';
import IconSpinner from '~icons/svg-spinners/90-ring-with-bg';
import type { AdminSection } from '@repo/contracts/universal';

interface AdminSectionActionsProps {
  userId: string
  section: AdminSection
}

export function AdminSectionActions({ userId, section }: AdminSectionActionsProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const change = useAdminSectionMode({ userId, section });
  const label = adminSectionLabel(section.id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {section.mode === 'global'
        ? <Badge variant="outline">{m.admin_section_global()}</Badge>
        : <Badge variant="secondary">{m.admin_section_overridden()}</Badge>}
      {section.mode === 'global' ? (
        <ButtonLoading
          loading={change.isPending}
          size="sm"
          variant="outline"
          onClick={() => change.mutate('overridden')}
        >
          {m.admin_section_override()}
        </ButtonLoading>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsConfirming(true)}
        >
          {m.admin_section_back()}
        </Button>
      )}
      {section.mode === 'global' && change.isError ? (
        <span className="text-xs text-destructive" role="alert">{adminProblem({ error: change.error, failed: m.admin_section_override_failed() })}</span>
      ) : null}
      {isConfirming ? (
        <ConfirmationDialog
          confirmLabel={m.admin_section_back()}
          error={change.isError ? adminProblem({ error: change.error, failed: m.admin_section_back_failed() }) : null}
          pending={change.isPending}
          title={m.admin_section_back_title({ section: label })}
          variant="destructive"
          onConfirm={() => change.mutate('global', { onSuccess: () => setIsConfirming(false) })}
          onOpenChange={setIsConfirming}
        >
          {m.admin_section_back_description({ section: label })}
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}

interface AdminSectionNoticeProps {
  userId: string
  section: AdminSection
}

export function AdminSectionNotice({ userId, section }: AdminSectionNoticeProps) {
  const retry = useAdminSectionMode({ userId, section });

  return match(section)
    .with({ mode: 'global', sync: 'failed' }, ({ error }) => (
      <Alert variant="destructive">
        <IconTriangleAlert />
        <AlertTitle>{m.admin_section_failed()}</AlertTitle>
        <AlertDescription>
          {error ? <p className="font-mono text-xs break-all">{error}</p> : null}
          <ButtonLoading
            loading={retry.isPending}
            size="xs"
            variant="outline"
            onClick={() => retry.mutate('global')}
          >
            {m.layout_retry()}
          </ButtonLoading>
        </AlertDescription>
      </Alert>
    ))
    .with({ sync: 'pending' }, () => (
      <output className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconSpinner aria-hidden className="size-4" />
        {m.admin_section_pending()}
      </output>
    ))
    .with({ mode: 'global' }, () => (
      <p className="text-sm text-muted-foreground">
        {m.admin_section_global_hint()}
        {' '}
        <Link
          className="underline underline-offset-4 hover:text-foreground"
          params={{ userId: ADMIN.templateId, tab: section.id }}
          to="/admin/users/$userId/settings/$tab"
        >
          {m.admin_section_open_global()}
        </Link>
      </p>
    ))
    .otherwise(() => null);
}
