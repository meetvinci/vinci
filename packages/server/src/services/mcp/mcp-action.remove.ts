import { Errors } from '@repo/errors/universal';
import { match } from 'ts-pattern';
import { mcpFilesDerivedRelease, mcpFilesRead, mcpFilesWrite } from './mcp-files.utils';
import type { McpServiceDeps } from '../../types/mcp.types';
import type { McpServerRemoveInput } from '@repo/contracts/universal';

export async function mcpActionRemove(deps: McpServiceDeps, { botId, name }: McpServerRemoveInput) {
  const document = await mcpFilesRead(deps, botId);

  await match(Object.hasOwn(document.mcpServers, name))
    .with(false, () => {
      throw new Errors.NOT_FOUND({ resource: 'mcp server', resourceId: name });
    })
    .with(true, async () => {
      const mcpServers = Object.fromEntries(Object.entries(document.mcpServers).filter(([key]) => key !== name));
      await mcpFilesWrite(deps, botId, { mcpServers });
      await mcpFilesDerivedRelease(deps, botId, Object.entries(document.mcpServers).filter(([key]) => key === name).map(([, entry]) => entry));
    })
    .exhaustive();
}
