import { m } from '@repo/i18n/client';
import { ButtonLoading } from '@repo/ui/button-loading';
import { useMutation } from '@tanstack/react-query';
import { useTeam } from '@/hooks/use-team';
import { teamOverride } from '@/services/team/team.client';
import { TEAM } from '@/services/team/team.constants';
import type { AdminSectionId } from '@repo/contracts/universal';
import type { ReactNode } from 'react';

interface SettingsManagedProps {
  section: AdminSectionId
  children: ReactNode
}

export function SettingsManaged({ section, children }: SettingsManagedProps) {
  const team = useTeam();

  const override = useMutation({
    mutationFn: () => teamOverride({ section }),
    meta: { error: m.settings_managed_override_failed(), invalidates: [TEAM.queryKey] },
  });

  if (!team.followsGlobal(section)) {
    return children;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{m.settings_managed()}</p>
        {team.isAdvanced ? (
          <ButtonLoading
            loading={override.isPending}
            size="sm"
            variant="outline"
            onClick={() => override.mutate()}
          >
            {m.settings_managed_override()}
          </ButtonLoading>
        ) : null}
      </div>
      <div inert className="flex flex-col gap-10 opacity-60">
        {children}
      </div>
    </>
  );
}
