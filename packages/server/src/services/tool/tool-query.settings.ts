import { TOOL_APPROVAL, toolApprovalRules, toolApprovalTimeout, toolPolicy } from '@repo/contracts/universal';
import { TOOL } from './tool.constants';
import type { ToolServiceDeps } from '../../types/tool.types';
import type { ToolSettings } from '@repo/contracts/universal';

export async function toolQuerySettings({ settings, credentials }: ToolServiceDeps): Promise<ToolSettings> {
  const [isJevConfigured, stored] = await Promise.all([
    credentials.queries.has({ key: TOOL.jevCredential }),
    settings.queries.get({ keys: [TOOL.approvalRulesSetting, TOOL.approvalTimeoutSetting, TOOL.policySetting, TOOL.policyDefaultsSetting] }),
  ]);

  const toolStored = (key: string) => stored.find((record) => record.key === key)?.value;

  return {
    isJevConfigured,
    approvalRules: toolApprovalRules.parse(JSON.parse(toolStored(TOOL.approvalRulesSetting) ?? '[]')),
    approvalTimeoutMinutes: toolApprovalTimeout.catch(TOOL_APPROVAL.defaultTimeoutMinutes).parse(Number(toolStored(TOOL.approvalTimeoutSetting))),
    policy: toolPolicy.parse(JSON.parse(toolStored(TOOL.policySetting) ?? JSON.stringify(TOOL.emptyPolicy))),
    policyDefaults: toolPolicy.parse(JSON.parse(toolStored(TOOL.policyDefaultsSetting) ?? JSON.stringify(TOOL.emptyPolicy))),
  };
}
