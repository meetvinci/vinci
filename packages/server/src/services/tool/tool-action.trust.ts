import { toolQuerySettings } from './tool-query.settings';
import { TOOL } from './tool.constants';
import type { ToolServiceDeps } from '../../types/tool.types';
import type { ToolTrustInput } from '@repo/contracts/universal';

export async function toolActionTrust(deps: ToolServiceDeps, { server, isTrusted }: ToolTrustInput) {
  const { policy } = await toolQuerySettings(deps);
  const others = policy.trusted.filter((key) => key !== server);

  await deps.settings.actions.set({
    records: [{
      key: TOOL.policySetting,
      value: JSON.stringify({ ...policy, trusted: isTrusted ? [...others, server] : others }),
    }],
  });

  return toolQuerySettings(deps);
}
