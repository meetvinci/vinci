import { ORPCError } from '@orpc/client';
import { mcpFileDocument } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { expandValidationError } from '@repo/i18n/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { match, P } from 'ts-pattern';
import { useRpc } from './use-rpc';
import type { BotMcpFileParams } from '../types/bot.types';
import type { McpReplaceInput } from '@repo/contracts/universal';

export function useBotMcpFile({ botId, onDone }: BotMcpFileParams) {
  const { rpc } = useRpc();
  const queryClient = useQueryClient();
  const [invalid, setInvalid] = useState<string | null>(null);

  const file = useQuery(rpc.mcp.get.queryOptions({ input: { botId } }));

  const replace = useMutation(rpc.mcp.replace.mutationOptions({
    onSuccess: async (catalog) => {
      queryClient.setQueryData(rpc.mcp.discover.queryKey({ input: { botId } }), catalog);
      await queryClient.invalidateQueries({ queryKey: rpc.mcp.get.key() });
      onDone();
    },
  }));

  return {
    text: file.data ? `${JSON.stringify(file.data, null, 2)}\n` : null,
    isLoadFailed: file.isError,
    isPending: replace.isPending,
    problem: invalid ?? mcpFileProblem(replace.error),
    clear: () => {
      setInvalid(null);
      replace.reset();
    },
    save: (text: string) => {
      const parsed = mcpFileParse(text);

      if (!parsed.isValid) {
        setInvalid(parsed.problem);
        return;
      }

      setInvalid(null);
      replace.mutate({ botId, mcpServers: parsed.mcpServers });
    },
  };
}

function mcpFileParse(text: string): { isValid: true; mcpServers: McpReplaceInput['mcpServers'] } | { isValid: false; problem: string } {
  const document = mcpFileJson(text.trim());
  const result = mcpFileDocument.safeParse(document);

  if (result.success) {
    return { isValid: true, mcpServers: result.data.mcpServers };
  }

  const [issue] = result.error.issues;
  const [top, name] = issue.path;
  const server = String(name);
  const isCommand = Object.hasOwn(Object(Object(Object(document).mcpServers)[server]), 'command');

  const leaf = match(issue)
    .with({ code: 'invalid_union' }, ({ errors }) => ({ ...errors[isCommand ? 1 : 0][0], isUnion: true }))
    .otherwise((direct) => ({ ...direct, path: direct.path.slice(2), isUnion: false }));

  const field = leaf.path.join('.');

  const problem = match({
    top,
    depth: issue.path.length,
    issue,
    leaf,
  })
    .with({ top: P.not('mcpServers') }, { depth: 1, issue: { message: P.not('validation_mcp_file_count') } }, () => m.validation_mcp_file_json())
    .with({ depth: 1 }, () => m.validation_mcp_file_count())
    .with({ depth: 2, issue: { code: 'invalid_key' } }, () => m.validation_mcp_file_name({ server }))
    .with({ leaf: { code: 'unrecognized_keys' } }, ({ leaf: { keys } }) => m.validation_mcp_file_field({ server, field: keys.join(', ') }))
    .with({ leaf: { isUnion: true, code: 'invalid_type', path: [P.union('url', 'command')] } }, () => m.validation_mcp_file_server({ server }))
    .with({ leaf: { path: ['url'] } }, () => m.validation_mcp_file_url({ server }))
    .otherwise(() => m.validation_mcp_file_value({ server, field }));

  return { isValid: false, problem };
}

function mcpFileJson(text: string) {
  if (text === '') {
    return { mcpServers: {} };
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function mcpFileProblem(error: Error | null) {
  return match(error)
    .with(null, () => null)
    .with(P.instanceOf(ORPCError), (failure) => match(failure.data)
      .with(
        { fields: { mcpServers: P.select({ message: P.string, args: P.optional(P.record(P.string, P.union(P.string, P.number))) }) } },
        ({ message, args }) => expandValidationError(message, args ?? {}),
      )
      .otherwise(() => (failure.code === 'TEAM_MANAGED' ? m.ui_team_managed() : m.bots_mcp_file_failed())))
    .otherwise(() => m.bots_mcp_file_failed());
}
