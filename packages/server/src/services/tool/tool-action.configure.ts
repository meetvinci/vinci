import { match, P } from 'ts-pattern';
import { toolQuerySettings } from './tool-query.settings';
import { TOOL } from './tool.constants';
import type { ToolServiceDeps } from '../../types/tool.types';
import type { ToolConfigureInput } from '@repo/contracts/universal';

export async function toolActionConfigure(deps: ToolServiceDeps, { jevApiKey, ...stored }: ToolConfigureInput) {
  await match(jevApiKey)
    .with(P.union(P.string, null), (value) => deps.credentials.actions.set({ key: TOOL.jevCredential, value }))
    .otherwise(() => undefined);

  const records = [
    { key: TOOL.approvalRulesSetting, value: stored.approvalRules },
    { key: TOOL.approvalTimeoutSetting, value: stored.approvalTimeoutMinutes },
    { key: TOOL.policySetting, value: stored.policy },
    { key: TOOL.policyDefaultsSetting, value: stored.policyDefaults },
  ].flatMap(({ key, value }) => (value === undefined ? [] : [{ key, value: JSON.stringify(value) }]));

  await match(records)
    .with([], () => undefined)
    .otherwise(() => deps.settings.actions.set({ records }));

  return toolQuerySettings(deps);
}
