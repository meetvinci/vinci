import { m } from '@repo/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toolPolicyServers } from '../services/tool/tool.utils';
import { useRpc } from './use-rpc';
import type { ToolSettings } from '@repo/contracts/universal';

export function useSettingsToolPolicy() {
  const queryClient = useQueryClient();
  const { rpc } = useRpc();
  const settings = useQuery(rpc.tools.settings.queryOptions());
  const servers = useQuery(rpc.tools.servers.queryOptions({ staleTime: 0 }));
  const onSuccess = (saved: ToolSettings) => queryClient.setQueryData(rpc.tools.settings.queryKey(), saved);
  const control = useMutation(rpc.tools.control.mutationOptions({ onSuccess }));
  const trust = useMutation(rpc.tools.trust.mutationOptions({ onSuccess }));
  const policy = settings.data?.policy;
  const defaults = settings.data?.policyDefaults;

  return {
    isLoading: settings.isPending || servers.isPending,
    isPending: control.isPending || trust.isPending,
    problem: control.isError || trust.isError || servers.isError ? m.settings_tools_policy_failed() : null,
    servers: policy && defaults ? toolPolicyServers({
      policy,
      defaults,
      servers: servers.data ?? [],
    }) : [],
    others: (policy?.controls ?? []).filter((item) => item.server === null),
    change: control.mutate,
    trust: (server: string, isTrusted: boolean) => trust.mutate({ server, isTrusted }),
  };
}
