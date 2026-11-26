import { TOOL_APPROVAL } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toolPolicyServers } from '../services/tool/tool.utils';
import { useRpc } from './use-rpc';
import type { ToolPolicyChange } from '../types/tool.types';
import type { ToolControl } from '@repo/contracts/universal';

export function useSettingsToolPolicy() {
  const queryClient = useQueryClient();
  const { rpc } = useRpc();
  const settings = useQuery(rpc.tools.settings.queryOptions());
  const servers = useQuery(rpc.tools.servers.queryOptions({ staleTime: 0 }));

  const save = useMutation(rpc.tools.configure.mutationOptions({
    onSuccess: (saved) => queryClient.setQueryData(rpc.tools.settings.queryKey(), saved),
  }));

  const policy = settings.data?.policy;
  const defaults = settings.data?.policyDefaults;

  const change = (next: ToolPolicyChange) => {
    if (!policy) {
      return;
    }

    const controls = policy.controls.filter((control) => !(control.server === next.server && control.tool === next.tool));
    const added: ToolControl[] = next.behavior === null ? [] : [{ server: next.server, tool: next.tool, behavior: next.behavior }];

    save.mutate({ policy: { ...policy, controls: [...controls, ...added].slice(-TOOL_APPROVAL.maxControls) } });
  };

  return {
    isLoading: settings.isPending || servers.isPending,
    isPending: save.isPending,
    problem: save.isError || servers.isError ? m.settings_tools_policy_failed() : null,
    servers: policy && defaults ? toolPolicyServers({
      policy,
      defaults,
      servers: servers.data ?? [],
    }) : [],
    others: (policy?.controls ?? []).filter((control) => control.server === null),
    change,
    trust: (key: string, isTrusted: boolean) => policy && save.mutate({
      policy: { ...policy, trusted: isTrusted ? [...new Set([...policy.trusted, key])] : policy.trusted.filter((item) => item !== key) },
    }),
  };
}
