import { Errors } from '@repo/errors/universal';
import { match, P } from 'ts-pattern';
import { mcpServer } from '@repo/runtime/server';
import { mcpFilesWrite } from './mcp-files.utils';
import { MCP } from './mcp.constants';
import type { McpServiceDeps } from '../../types/mcp.types';
import type { BotFilesImportInput } from '@repo/contracts/universal';

export async function mcpActionOwn(deps: McpServiceDeps, { botId, mcp }: Pick<BotFilesImportInput, 'botId' | 'mcp'>): Promise<void> {
  const mcpOwnedKey = (key: string) => match(MCP.derivedKey.exec(key)?.groups?.rest)
    .with(P.string, (rest) => `${MCP.derivedPrefix}${botId}.${rest}`)
    .otherwise(() => key);

  const credentials = Object.entries(mcp.credentials).map(([key, value]) => {
    if (!MCP.derivedKey.test(key)) {
      throw new Errors.VALIDATION_ERROR({ fields: { mcp: { message: 'validation_workspace_path' } }, internal: `Refused credential ${key}` });
    }

    return { key: mcpOwnedKey(key), value };
  });

  const mcpOwnedKeys = (references: Record<string, string>) => Object.fromEntries(Object.entries(references).map(([name, key]) => [name, mcpOwnedKey(key)]));

  const mcpServers = Object.fromEntries(Object.entries(mcp.mcpServers).map(([name, entry]) => [name, match(mcpServer.safeParse(entry))
    .with({ success: true, data: { headerCredentials: P.nonNullable } }, ({ data }) => ({ ...data, headerCredentials: mcpOwnedKeys(data.headerCredentials) }))
    .with({ success: true, data: { envCredentials: P.nonNullable } }, ({ data }) => ({ ...data, envCredentials: mcpOwnedKeys(data.envCredentials) }))
    .otherwise(() => entry)]));

  const { set } = deps.credentials.actions;

  await Promise.all(credentials.map((credential) => set(credential)));
  await mcpFilesWrite(deps, botId, { mcpServers });
}
