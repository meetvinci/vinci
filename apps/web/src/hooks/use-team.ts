import { useQuery } from '@tanstack/react-query';
import { useSectionScope } from '@/hooks/use-section-scope';
import { teamQuery } from '@/services/team/team.client';
import type { AdminSectionId } from '@repo/contracts/universal';

export function useTeam() {
  const scope = useSectionScope();
  const { data } = useQuery({ ...teamQuery(), enabled: !scope.isAdmin });
  const team = scope.isAdmin ? null : data ?? null;

  return {
    isTeam: team !== null,
    isAdvanced: team === null || team.isAdvanced,
    canSeeSteps: team === null || team.isAdvanced || team.isAdmin,
    followsGlobal: (section: AdminSectionId) => team?.sections.some((item) => item.id === section && item.mode === 'global') ?? false,
  };
}
