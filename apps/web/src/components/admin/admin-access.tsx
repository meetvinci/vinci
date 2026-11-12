import { m } from '@repo/i18n/client';
import { Alert, AlertDescription } from '@repo/ui/alert';
import { Badge } from '@repo/ui/badge';
import { match } from 'ts-pattern';
import IconCircleCheck from '~icons/lucide/circle-check';
import IconCircleHelp from '~icons/lucide/circle-help';
import IconGlobe from '~icons/lucide/globe';
import IconTriangleAlert from '~icons/lucide/triangle-alert';
import type { AdminAccessState } from '@repo/contracts/universal';
import type { ReactNode } from 'react';

interface AdminAccessProps {
  access: AdminAccessState
  isEnabled?: boolean
}

export function AdminAccess({ access, isEnabled = true }: AdminAccessProps) {
  return match({ access, isEnabled })
    .with({ access: 'not-allowed', isEnabled: true }, () => (
      <Badge title={m.admin_access_not_allowed_hint()} variant="warning">
        <IconTriangleAlert />
        {m.admin_access_not_allowed()}
      </Badge>
    ))
    .with({ access: 'not-allowed' }, () => <AdminAccessQuiet>{m.admin_access_not_allowed()}</AdminAccessQuiet>)
    .with({ access: 'allowed' }, () => (
      <AdminAccessQuiet>
        <IconCircleCheck className="size-3.5" />
        {m.admin_access_allowed()}
      </AdminAccessQuiet>
    ))
    .with({ access: 'unknown' }, () => (
      <AdminAccessQuiet>
        <IconCircleHelp className="size-3.5" />
        {m.admin_access_unknown()}
      </AdminAccessQuiet>
    ))
    .exhaustive();
}

interface AdminAccessQuietProps {
  children: ReactNode
}

function AdminAccessQuiet({ children }: AdminAccessQuietProps) {
  return <span className="flex items-center gap-1 text-xs text-muted-foreground">{children}</span>;
}

interface AdminAccessNoticeProps {
  domains: string[] | undefined
  isUnknown: boolean
}

export function AdminAccessNotice({ domains, isUnknown }: AdminAccessNoticeProps) {
  return (
    <>
      {domains && domains.length > 0 ? (
        <Alert role="note">
          <IconGlobe />
          <AlertDescription>{m.admin_access_domain({ domains: domains.map((domain) => `@${domain}`).join(', ') })}</AlertDescription>
        </Alert>
      ) : null}
      {isUnknown ? <p className="text-sm text-muted-foreground">{m.admin_access_unknown_hint()}</p> : null}
    </>
  );
}
