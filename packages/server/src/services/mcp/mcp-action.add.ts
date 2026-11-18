import { Errors } from '@repo/errors/universal';
import { match, P } from 'ts-pattern';
import { mcpFilesDerivedKey, mcpFilesDerivedRelease, mcpFilesRead, mcpFilesReferences, mcpFilesWrite } from './mcp-files.utils';
import { MCP } from './mcp.constants';
import { mcpIsHostAllowed, mcpIsUrlAllowed } from './mcp.utils';
import type { McpServiceDeps } from '../../types/mcp.types';
import type { McpServerAddInput } from '@repo/contracts/universal';

export async function mcpActionAdd(deps: McpServiceDeps, params: McpServerAddInput) {
  const { botId, name } = params;
  const headers = params.headers ?? [];
  const env = params.env ?? [];

  if (params.url !== undefined && !mcpIsUrlAllowed(deps.internalAllow, params.url)) {
    throw new Errors.VALIDATION_ERROR({ fields: { url: { message: 'validation_mcp_http', args: { server: name } } } });
  }

  await mcpCheckSecrets('headers', headers.map(({ secret }) => secret));
  await mcpCheckSecrets('env', env.map(({ secret }) => secret));
  if (params.url !== undefined && headers.length > 0) {
    await mcpCheckHeaderHosts(params.url, headers.map(({ secret }) => secret));
  }

  const preparedHeaders = await Promise.all(headers.map(async (header, index) => {
    const key = mcpSecretKey(header.secret);
    const stored = await deps.credentials.queries.get({ key });

    if (stored === null) {
      throw new Errors.VALIDATION_ERROR({ fields: { headers: { message: 'validation_mcp_secret_missing' } } });
    }

    return match(header.prefix)
      .with(P.string, (prefix) => {
        const derived = mcpFilesDerivedKey(botId, name, index);
        return { name: header.name, key: derived, derived: { key: derived, value: `${prefix}${stored}` } };
      })
      .with(undefined, () => ({ name: header.name, key, derived: undefined }))
      .exhaustive();
  }));

  const headerCredentials = Object.fromEntries(preparedHeaders.map(({ name: headerName, key }) => [headerName, key]));

  const envCredentials = Object.fromEntries(env.map((entry) => [entry.name, mcpSecretKey(entry.secret)]));

  const entry = match(params)
    .with({ url: P.string }, ({ url }) => ({ url, headerCredentials: headers.length > 0 ? headerCredentials : undefined }))
    .otherwise(({ command, args }) => ({ command, args, envCredentials: env.length > 0 ? envCredentials : undefined }));

  const document = await mcpFilesRead(deps, botId);
  const { set } = deps.credentials.actions;
  await Promise.all(preparedHeaders.flatMap(({ derived }) => derived ? [set(derived)] : []));

  await mcpFilesWrite(deps, botId, { mcpServers: { ...document.mcpServers, [name]: entry } });
  const replaced = Object.entries(document.mcpServers).filter(([key]) => key === name).map(([, previous]) => previous);
  await mcpFilesDerivedRelease(deps, botId, replaced, new Set(mcpFilesReferences(entry).map(({ key }) => key)));

  function mcpSecretKey(secret: string) {
    return `${MCP.secretPrefix}${secret}`;
  }

  async function mcpCheckSecrets(field: 'headers' | 'env', secrets: string[]) {
    const stored = await Promise.all(secrets.map((secret) => deps.credentials.queries.has({ key: mcpSecretKey(secret) })));

    match(stored.every(Boolean))
      .with(true, () => undefined)
      .with(false, () => {
        throw new Errors.VALIDATION_ERROR({ fields: { [field]: { message: 'validation_mcp_secret_missing' } } });
      })
      .exhaustive();
  }

  async function mcpCheckHeaderHosts(urlValue: string, secrets: string[]) {
    const host = new URL(urlValue).hostname;
    const rules = await deps.secrets.queries.rules();

    const allowed = secrets.every((secret) => mcpIsHostAllowed(rules, secret, host));

    match(allowed)
      .with(true, () => undefined)
      .with(false, () => {
        throw new Errors.VALIDATION_ERROR({ fields: { headers: { message: 'validation_mcp_secret_host' } } });
      })
      .exhaustive();
  }
}
