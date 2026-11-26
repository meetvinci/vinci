import { z } from 'zod';

export const toolApprovalRules = z.array(z.object({
  when: z.string().trim().min(1).max(300),
  behavior: z.enum(['allow', 'ask']),
})).max(50);

export const TOOL_APPROVAL = {
  timeoutMinutes: [1, 2, 3, 5, 10],
  defaultTimeoutMinutes: 5,
  maxControls: 500,
  expiredResult: 'Nobody answered the approval request in time, so the tool did not run.',
} as const;

export const toolApprovalTimeout = z.number().int().min(1).max(10);

export const toolServerKey = z.string().min(1).max(2048);

const toolControlFields = z.object({
  server: toolServerKey.nullable(),
  tool: z.string().min(1).max(200).nullable(),
  behavior: z.enum(['allow', 'ask']),
});

export const toolControl = toolControlFields.refine(({ server, tool }) => server !== null || tool !== null);

export const toolControlChange = toolControlFields.extend({ behavior: toolControlFields.shape.behavior.nullable() })
  .refine(({ server, tool }) => server !== null || tool !== null);

export const toolTrust = z.object({ server: toolServerKey, isTrusted: z.boolean() });

export const toolPolicy = z.object({
  controls: z.array(toolControl).max(TOOL_APPROVAL.maxControls),
  trusted: z.array(toolServerKey).max(200),
});

export const toolSettings = z.object({
  isJevConfigured: z.boolean(),
  approvalRules: toolApprovalRules,
  approvalTimeoutMinutes: toolApprovalTimeout,
  policy: toolPolicy,
  policyDefaults: toolPolicy,
});

export const toolConfigure = toolSettings.pick({
  approvalRules: true,
  approvalTimeoutMinutes: true,
  policy: true,
  policyDefaults: true,
}).extend({
  jevApiKey: z.string().trim().min(1).max(8192).nullable(),
}).partial();

export const toolServer = z.object({
  key: toolServerKey,
  names: z.array(z.string()),
  isShipped: z.boolean(),
  tools: z.array(z.object({
    name: z.string(),
    title: z.string(),
    declaresReadOnly: z.boolean(),
  })),
});

export const toolServers = z.array(toolServer);

export const toolAction = z.object({
  server: toolServerKey.nullable(),
  serverName: z.string().nullable(),
  tool: z.string(),
  canAllowAlways: z.boolean(),
});

export const toolExport = z.object({ jevApiKey: z.string().min(1).max(8192).nullable() });

export const toolPending = z.object({ botId: z.uuid() });

export const toolApproval = z.object({
  id: z.number().int().positive(),
  botId: z.uuid(),
  conversationId: z.number().int().positive(),
  privateWith: z.uuid().nullable(),
  toolName: z.string(),
  arguments: z.json(),
  action: toolAction,
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
});

export const toolApprovalList = z.array(toolApproval);

export const toolAnswer = toolPending.extend({
  id: z.number().int().positive(),
  approved: z.boolean(),
  always: z.boolean().optional(),
});

export const toolAnswerResult = z.object({ accepted: z.boolean() });

export const toolSettingsForm = z.object({
  approvalRules: toolApprovalRules,
  approvalTimeoutMinutes: toolApprovalTimeout,
  jevApiKey: z.string().trim().max(8192),
});

export type ToolConfigureInput = z.infer<typeof toolConfigure>;
export type ToolSettings = z.infer<typeof toolSettings>;
export type ToolExport = z.infer<typeof toolExport>;
export type ToolPendingInput = z.infer<typeof toolPending>;
export type ToolApproval = z.infer<typeof toolApproval>;
export type ToolAnswerInput = z.infer<typeof toolAnswer>;
export type ToolSettingsForm = z.infer<typeof toolSettingsForm>;
export type ToolApprovalRule = z.infer<typeof toolApprovalRules>[number];
export type ToolControl = z.infer<typeof toolControl>;
export type ToolControlChangeInput = z.infer<typeof toolControlChange>;
export type ToolTrustInput = z.infer<typeof toolTrust>;
export type ToolPolicy = z.infer<typeof toolPolicy>;
export type ToolServer = z.infer<typeof toolServer>;
export type ToolAction = z.infer<typeof toolAction>;
