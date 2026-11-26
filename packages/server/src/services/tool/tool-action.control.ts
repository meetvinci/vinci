import { TOOL_APPROVAL } from '@repo/contracts/universal';
import { toolQuerySettings } from './tool-query.settings';
import { TOOL } from './tool.constants';
import type { ToolServiceDeps } from '../../types/tool.types';
import type { ToolControlChangeInput } from '@repo/contracts/universal';

export async function toolActionControl(deps: ToolServiceDeps, { server, tool, behavior }: ToolControlChangeInput) {
  const { policy } = await toolQuerySettings(deps);
  const controls = policy.controls.filter((control) => control.server !== server || control.tool !== tool);
  const added = behavior === null ? [] : [{ server, tool, behavior }];

  await deps.settings.actions.set({
    records: [{
      key: TOOL.policySetting,
      value: JSON.stringify({ ...policy, controls: [...controls, ...added].slice(-TOOL_APPROVAL.maxControls) }),
    }],
  });

  return toolQuerySettings(deps);
}
