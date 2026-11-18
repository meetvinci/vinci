import { Errors } from '@repo/errors/universal';
import { randomBytes } from 'node:crypto';
import { match, P } from 'ts-pattern';
import { mcpFilesDerivedRelease, mcpFilesRead, mcpFilesReferences, mcpFilesWrite } from './mcp-files.utils';
import { MCP } from './mcp.constants';
import { mcpIsHostAllowed } from './mcp.utils';
import type { McpServiceDeps } from '../../types/mcp.types';
import type { McpFileServer, McpReplaceInput } from '@repo/contracts/universal';

export async function mcpActionReplace(deps: McpServiceDeps, { botId, mcpServers }: McpReplaceInput) {
  const previous = await mcpFilesRead(deps, botId);
  const derivedPrefix = `${MCP.derivedPrefix}${botId}.`;

  // SAFETY: a kept derived key stays with its server, where it went before: an env key to env, a header key to the same host.
  const kept = new Map(Object.entries(previous.mcpServers)
    .flatMap(([server, entry]) => mcpFilesReferences(entry).map(({ key, host }) => [key, { server, host }] as const)));

  const rules = await deps.secrets.queries.rules();
  const created: { key: string; value: string }[] = [];

  const replaced = await Promise.all(Object.entries(mcpServers).map(async ([name, server]) => [name, await mcpReplaceServer(name, server)] as const));
  const servers = Object.fromEntries(replaced);

  const { set } = deps.credentials.actions;
  await Promise.all(created.map((credential) => set(credential)));
  await mcpFilesWrite(deps, botId, { mcpServers: servers });

  const referenced = new Set(Object.values(servers).flatMap((entry) => mcpFilesReferences(entry)).map(({ key }) => key));
  await mcpFilesDerivedRelease(deps, botId, Object.values(previous.mcpServers), referenced);

  async function mcpReplaceServer(name: string, server: McpFileServer) {
    return match(server)
      .with({ url: P.string }, async ({ headers = {}, headerCredentials = {}, ...rest }) => {
        const references = await mcpReplaceReferences(name, headers, headerCredentials, new URL(rest.url).hostname);
        return Object.keys(references).length > 0 ? { ...rest, headerCredentials: references } : rest;
      })
      .with({ command: P.string }, async ({ env = {}, envCredentials = {}, ...rest }) => {
        const references = await mcpReplaceReferences(name, env, envCredentials, null);
        return Object.keys(references).length > 0 ? { ...rest, envCredentials: references } : rest;
      })
      .exhaustive();
  }

  async function mcpReplaceReferences(server: string, values: Record<string, string>, references: Record<string, string>, host: string | null) {
    const checked = Object.entries(references).filter(([field]) => !Object.hasOwn(values, field));
    await Promise.all(checked.map(([field, key]) => mcpReplaceCheck(server, field, key, host)));

    const stored = Object.entries(values).map(([field, value]) => {
      const key = `${derivedPrefix}${server}.${randomBytes(4).toString('hex')}`;
      created.push({ key, value });

      return [field, key] as const;
    });

    return { ...Object.fromEntries(checked), ...Object.fromEntries(stored) };
  }

  async function mcpReplaceCheck(server: string, field: string, key: string, host: string | null) {
    const secret = key.startsWith(MCP.secretPrefix) ? key.slice(MCP.secretPrefix.length) : null;

    const isStored = await match(secret)
      .with(P.string, () => deps.credentials.queries.has({ key }))
      .otherwise(() => key.startsWith(derivedPrefix) && kept.get(key)?.server === server);

    if (!isStored) {
      throw new Errors.VALIDATION_ERROR({ fields: { mcpServers: { message: 'validation_mcp_file_secret', args: { server, field } } } });
    }

    const isAllowed = match({ secret, host })
      .with({ secret: P.string, host: P.string }, ({ secret: name, host: target }) => mcpIsHostAllowed(rules, name, target))
      .with({ secret: P.string, host: null }, () => true)
      .otherwise(() => kept.get(key)?.host === host);

    if (!isAllowed) {
      throw new Errors.VALIDATION_ERROR({ fields: { mcpServers: { message: 'validation_mcp_file_host', args: { server, field } } } });
    }
  }
}
