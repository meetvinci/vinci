import { m } from '@repo/i18n/client';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/alert';
import { ConfirmationDialog } from '@repo/ui/alert-dialog';
import { ButtonLoading } from '@repo/ui/button-loading';
import { useQuery } from '@tanstack/react-query';
import { match, P } from 'ts-pattern';
import { useAdminSectionMode } from '@/hooks/use-admin-section-mode';
import { adminSectionPreviewQuery } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminIsPreviewStale, adminPreviewKind, adminPreviewName, adminProblem, adminSectionLabel } from '@/services/admin/admin.utils';
import IconTriangleAlert from '~icons/lucide/triangle-alert';
import IconSpinner from '~icons/svg-spinners/90-ring-with-bg';
import type { AdminPreviewItem, AdminSection } from '@repo/contracts/universal';

interface AdminSectionBackProps {
  userId: string
  section: AdminSection
  onOpenChange: (open: boolean) => void
}

export function AdminSectionBack({ userId, section, onOpenChange }: AdminSectionBackProps) {
  const preview = useQuery(adminSectionPreviewQuery({ userId, section: section.id }));
  const change = useAdminSectionMode({ userId, section });
  const label = adminSectionLabel(section.id);
  const items = preview.data?.items ?? [];
  const isNothingLost = preview.isSuccess && items.every((item) => item.change === 'added');
  const isReady = preview.isSuccess && !preview.isFetching;

  const groups = ADMIN.previewChanges
    .map((kind) => ({ kind, items: items.filter((item) => item.change === kind) }))
    .filter((group) => group.items.length > 0);

  const limit = match(section.id)
    .with('models', () => m.admin_section_back_models_limit())
    .with('sources', () => m.admin_section_back_sources_limit())
    .with('secrets', () => m.admin_section_back_secrets_limit())
    .otherwise(() => null);

  const details = match(preview.status)
    .with('pending', () => (
      <output className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconSpinner aria-hidden className="size-4" />
        {m.admin_section_back_checking()}
      </output>
    ))
    .with('error', () => (
      <Alert variant="destructive">
        <IconTriangleAlert />
        <AlertTitle>{m.admin_section_back_unreachable_title()}</AlertTitle>
        <AlertDescription>
          <p>{m.admin_section_back_unreachable()}</p>
          <ButtonLoading
            loading={preview.isFetching}
            size="xs"
            variant="outline"
            onClick={() => void preview.refetch()}
          >
            {m.layout_retry()}
          </ButtonLoading>
        </AlertDescription>
      </Alert>
    ))
    .with('success', () => (
      <div className="grid max-h-80 gap-3 overflow-y-auto text-sm">
        {isNothingLost ? <p>{m.admin_section_back_nothing({ section: label })}</p> : null}
        {groups.map((group) => (
          <section className="grid gap-1" key={group.kind}>
            <h3 className="font-medium">
              {match(group.kind)
                .with('removed', () => m.admin_section_back_removed())
                .with('changed', () => m.admin_section_back_changed())
                .with('replaced', () => m.admin_section_back_replaced())
                .with('added', () => m.admin_section_back_added())
                .exhaustive()}
            </h3>
            <ul className="grid gap-1">
              {group.items.map((item) => <AdminSectionBackItem item={item} key={`${item.kind}:${item.name}`} />)}
            </ul>
          </section>
        ))}
        {limit ? <p className="text-xs text-muted-foreground">{limit}</p> : null}
      </div>
    ))
    .exhaustive();

  const error = match(change.error)
    .with(P.nullish, () => null)
    .when(adminIsPreviewStale, () => m.admin_section_back_stale())
    .otherwise((failure) => adminProblem({ error: failure, failed: m.admin_section_back_failed() }));

  return (
    <ConfirmationDialog
      canConfirm={isReady}
      confirmLabel={m.admin_section_back()}
      details={details}
      error={error}
      pending={change.isPending}
      size="md"
      title={m.admin_section_back_title({ section: label })}
      variant="destructive"
      onConfirm={() => change.mutate({ mode: 'global', marker: preview.data?.marker }, {
        onSuccess: () => onOpenChange(false),
        onError: (failure) => {
          if (adminIsPreviewStale(failure)) {
            void preview.refetch();
          }
        },
      })}
      onOpenChange={onOpenChange}
    >
      {m.admin_section_back_description({ section: label })}
    </ConfirmationDialog>
  );
}

interface AdminSectionBackItemProps {
  item: AdminPreviewItem
}

function AdminSectionBackItem({ item }: AdminSectionBackItemProps) {
  const name = adminPreviewName(item);

  return (
    <li className="flex min-w-0 gap-2">
      <span className="shrink-0 text-muted-foreground">{adminPreviewKind(item.kind)}</span>
      {name ? <span className="min-w-0 break-words">{name}</span> : <span className="min-w-0 font-mono break-all">{item.name}</span>}
    </li>
  );
}
