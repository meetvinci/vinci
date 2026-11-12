import { toolQueryAlwaysAllowed } from './tool-query.always-allowed';
import { TOOL } from './tool.constants';
import type { ToolServiceDeps } from '../../types/tool.types';
import type { ToolAlwaysAllowedClearInput } from '@repo/contracts/universal';

export async function toolActionClearAlwaysAllowed(deps: ToolServiceDeps, { botId, toolName }: ToolAlwaysAllowedClearInput) {
  const allowed = await toolQueryAlwaysAllowed(deps, { botId });
  const remaining = toolName === undefined ? [] : allowed.filter((name) => name !== toolName);

  if (remaining.length < allowed.length) {
    await deps.settings.actions.set({
      records: [{
        key: `${TOOL.alwaysAllowSettingPrefix}${botId}`,
        value: JSON.stringify(remaining),
      }],
    });
  }

  return remaining;
}
