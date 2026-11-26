import { toolActionAllow } from './tool-action.allow';
import { toolActionAuthorize } from './tool-action.authorize';
import { toolActionConfigure } from './tool-action.configure';
import { toolActionControl } from './tool-action.control';
import { toolActionTrust } from './tool-action.trust';
import { toolQueryAction } from './tool-query.action';
import { toolQueryExport } from './tool-query.export';
import { toolQueryServers } from './tool-query.servers';
import { toolQuerySettings } from './tool-query.settings';
import { TOOL } from './tool.constants';
import type { ToolServiceDeps, ToolTargetParams } from '../../types/tool.types';
import type { Context } from '@earendil-works/chord/context';
import type { ToolConfigureInput, ToolControlChangeInput, ToolTrustInput } from '@repo/contracts/universal';
import type { RuntimeToolCall } from '@repo/runtime/server';

export function makeToolService(deps: ToolServiceDeps) {
  return {
    authorize: (call: RuntimeToolCall, context: Context) => toolActionAuthorize(deps, { ...call, context }),
    approvalTimeoutMs: async () => (await toolQuerySettings(deps)).approvalTimeoutMinutes * TOOL.minuteMs,
    actions: {
      configure: (params: ToolConfigureInput) => toolActionConfigure(deps, params),
      allow: (params: ToolTargetParams) => toolActionAllow(deps, params),
      control: (params: ToolControlChangeInput) => toolActionControl(deps, params),
      trust: (params: ToolTrustInput) => toolActionTrust(deps, params),
    },
    queries: {
      settings: () => toolQuerySettings(deps),
      export: () => toolQueryExport(deps),
      servers: () => toolQueryServers(deps),
      action: (params: ToolTargetParams) => toolQueryAction(deps, params),
    },
  };
}

export type ToolService = ReturnType<typeof makeToolService>;
