import { TOOL_APPROVAL } from '@repo/contracts/universal';
import { toolQueryAction } from './tool-query.action';
import { toolQuerySettings } from './tool-query.settings';
import { TOOL } from './tool.constants';
import type { ToolServiceDeps, ToolTargetParams } from '../../types/tool.types';

export async function toolActionAllow(deps: ToolServiceDeps, params: ToolTargetParams) {
  const { server, tool, canAllowAlways } = toolQueryAction(deps, params);

  if (!canAllowAlways) {
    return;
  }

  const { policy } = await toolQuerySettings(deps);
  const controls = policy.controls.filter((control) => control.server !== server || control.tool !== tool);

  await deps.settings.actions.set({
    records: [{
      key: TOOL.policySetting,
      value: JSON.stringify({ ...policy, controls: [...controls, { server, tool, behavior: 'allow' }].slice(-TOOL_APPROVAL.maxControls) }),
    }],
  });
}
