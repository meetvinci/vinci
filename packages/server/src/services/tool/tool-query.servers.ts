import { toolIsShipped } from './tool.utils';
import type { ToolServiceDeps } from '../../types/tool.types';
import type { ToolServer } from '@repo/contracts/universal';

export function toolQueryServers({ mcp }: ToolServiceDeps): ToolServer[] {
  return mcp.queries.servers()
    .map(({ key, names, tools }) => ({
      key,
      names,
      isShipped: toolIsShipped(key),
      tools: tools.map((tool) => ({
        name: tool.name,
        title: tool.title ?? tool.annotations?.title ?? tool.name,
        declaresReadOnly: tool.annotations?.readOnlyHint === true,
      })),
    }))
    .sort((left, right) => Number(right.isShipped) - Number(left.isShipped) || left.key.localeCompare(right.key));
}
