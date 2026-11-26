import { toolQueryTarget } from './tool-query.target';
import { TOOL } from './tool.constants';
import type { ToolServiceDeps, ToolTargetParams } from '../../types/tool.types';
import type { ToolAction } from '@repo/contracts/universal';

export function toolQueryAction(deps: ToolServiceDeps, params: ToolTargetParams): ToolAction {
  const { server, serverName, tool } = toolQueryTarget(deps, params);

  return {
    server,
    serverName,
    tool,
    canAllowAlways: !TOOL.askFirstTools.some((name) => name === params.toolName),
  };
}
