import type { ToolServiceDeps, ToolTarget, ToolTargetParams } from '../../types/tool.types';

export function toolQueryTarget({ mcp }: ToolServiceDeps, { botId, toolName }: ToolTargetParams): ToolTarget {
  const found = mcp.queries.tool({ botId, name: toolName });

  return found
    ? { server: found.key, serverName: found.server, tool: found.tool.name, declaresReadOnly: found.tool.annotations?.readOnlyHint === true }
    : { server: null, serverName: null, tool: toolName, declaresReadOnly: false };
}
