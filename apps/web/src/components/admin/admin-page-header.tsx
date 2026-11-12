import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function AdminPageHeader({ title, description, actions }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
