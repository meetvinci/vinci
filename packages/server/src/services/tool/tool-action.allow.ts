import { toolActionControl } from './tool-action.control';
import { toolQueryAction } from './tool-query.action';
import type { ToolServiceDeps, ToolTargetParams } from '../../types/tool.types';

export async function toolActionAllow(deps: ToolServiceDeps, params: ToolTargetParams) {
  const { server, tool, canAllowAlways } = toolQueryAction(deps, params);

  if (canAllowAlways) {
    await toolActionControl(deps, {
      server,
      tool,
      behavior: 'allow',
    });
  }
}
