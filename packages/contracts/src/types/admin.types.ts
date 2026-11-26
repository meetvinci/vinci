import { z } from 'zod';
import { settingsSection } from './settings.types';

export const adminEmail = z.email().max(254);
export const adminUserId = z.string().regex(/^[a-z\d][a-z\d-]{0,62}$/u);
export const adminAccess = z.enum(['synced', 'manual']);
export const adminAccessState = z.enum(['allowed', 'not-allowed', 'unknown']);
export const adminAccessMode = z.enum(['emails', 'domain', 'unknown']);
export const adminUserState = z.enum(['running', 'starting', 'stopped', 'unknown']);

export const adminMe = z.object({ email: adminEmail });

export const admin = z.object({ email: adminEmail });
export const adminList = z.object({ admins: z.array(admin.extend({ access: adminAccessState })) });

export const adminUser = z.object({
  id: adminUserId,
  name: z.string(),
  email: adminEmail,
  enabled: z.boolean(),
  advanced: z.boolean(),
  state: adminUserState,
});

export const adminUserList = z.object({
  users: z.array(adminUser.extend({ access: adminAccessState })),
  accessMode: adminAccessMode,
  accessDomains: z.array(z.string()).optional(),
  hasAccounts: z.boolean(),
});

export const adminTemplateId = 'template';

export const adminUserCreate = z.object({
  name: z.string().trim().min(1).max(80),
  email: adminEmail,
  bots: z.array(z.uuid()).max(50).optional(),
});

export const adminChangeResult = z.object({ access: adminAccess.optional(), password: z.string().min(1).optional() });

export const adminPassword = z.object({ password: z.string().min(1) });

export const adminAccountsRefusal = z.object({ error: z.literal('accounts_unavailable') });

export const adminOutsideInput = z.strictObject({ botId: z.uuid(), conversationId: z.number().int().positive() });

export const adminOutsideResult = z.object({});

export const adminUserPatch = z.object({
  id: adminUserId,
  name: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  advanced: z.boolean().optional(),
});

export const adminSectionId = settingsSection.extract(['models', 'chat', 'tools', 'secrets', 'sources']);
export const adminPersonSection = adminSectionId.extract(['models', 'chat', 'sources']);
export const adminSectionMode = z.enum(['global', 'overridden']);
export const adminSectionSync = z.enum(['in-sync', 'pending', 'failed']);
export const adminTemplateState = z.enum(['ready', 'starting', 'missing']);

export const adminGlobal = z.object({
  sections: z.array(z.object({ id: adminSectionId, procedures: z.array(z.string()) })),
  state: adminTemplateState,
});

export const adminSection = z.object({
  id: adminSectionId,
  mode: adminSectionMode,
  sync: adminSectionSync,
  error: z.string().optional(),
});

export const adminUserSections = z.object({ sections: z.array(adminSection) });
export const adminSectionMarker = z.string().regex(/^[\w-]{43}$/u);
export const adminSectionModeInput = z.object({ mode: adminSectionMode, marker: adminSectionMarker.optional() });

export const adminPreviewKind = z.enum([
  'provider',
  'modelSetting',
  'chatSetting',
  'toolSetting',
  'secret',
  'secretSetting',
  'skill',
  'instruction',
  'plugin',
  'mcpServer',
  'file',
  'sourceSetting',
]);

export const adminPreviewChange = z.enum(['removed', 'changed', 'replaced', 'added']);

export const adminPreviewItem = z.object({
  kind: adminPreviewKind,
  name: z.string(),
  change: adminPreviewChange,
});

export const adminSectionPreview = z.object({
  section: adminSectionId,
  marker: adminSectionMarker,
  items: z.array(adminPreviewItem),
  isPartial: z.boolean(),
});

export const adminGlobalSyncInput = z.object({ section: adminSectionId.optional() });
export const adminGlobalStatus = z.object({ users: z.array(adminUserSections.extend({ id: adminUserId })) });
export const adminBotCopyInput = z.object({ bots: z.array(z.uuid()).min(1).max(50) });

export const adminBotCopy = z.object({
  from: z.uuid(),
  botId: z.uuid().nullable(),
  error: z.string().optional(),
  skipped: z.array(z.string()).optional(),
});

export const adminBotCopyResult = z.object({ bots: z.array(adminBotCopy) });
export const adminUserCreateResult = adminUser.extend(adminChangeResult.shape).extend({ bots: z.array(adminBotCopy).optional() });
export const adminSectionConflict = z.object({ code: z.literal('SECTION_FOLLOWS_GLOBAL'), section: adminSectionId });
export const adminRelayRefusal = z.object({ status: z.literal(409), body: adminSectionConflict });
export const adminAuditKind = z.enum(['read', 'change']);

export const adminAuditEntry = z.object({
  id: z.number().int(),
  createdAt: z.number().int(),
  by: z.string(),
  kind: adminAuditKind,
  action: z.string(),
  detail: z.string().nullable(),
  userId: z.string().nullable(),
  botId: z.string().nullable(),
  conversationId: z.number().int().nullable(),
  status: z.number().int(),
});

export const adminAuditPage = z.object({ entries: z.array(adminAuditEntry), next: z.number().int().nullable() });

export const adminAuditFilter = z.object({
  by: adminEmail.optional().catch(undefined),
  user: adminUserId.optional().catch(undefined),
  kind: adminAuditKind.optional().catch(undefined),
});

export type Admin = z.infer<typeof admin>;
export type AdminAccess = z.infer<typeof adminAccess>;
export type AdminAccessState = z.infer<typeof adminAccessState>;
export type AdminUserList = z.infer<typeof adminUserList>;
export type AdminUser = z.infer<typeof adminUser>;
export type AdminUserCreate = z.infer<typeof adminUserCreate>;
export type AdminUserState = z.infer<typeof adminUserState>;
export type AdminUserPatch = z.infer<typeof adminUserPatch>;
export type AdminSectionId = z.infer<typeof adminSectionId>;
export type AdminSectionMode = z.infer<typeof adminSectionMode>;
export type AdminSectionSync = z.infer<typeof adminSectionSync>;
export type AdminSection = z.infer<typeof adminSection>;
export type AdminGlobal = z.infer<typeof adminGlobal>;
export type AdminGlobalStatus = z.infer<typeof adminGlobalStatus>;
export type AdminBotCopy = z.infer<typeof adminBotCopy>;
export type AdminGlobalSyncInput = z.infer<typeof adminGlobalSyncInput>;
export type AdminSectionModeInput = z.infer<typeof adminSectionModeInput>;
export type AdminPreviewKind = z.infer<typeof adminPreviewKind>;
export type AdminPreviewChange = z.infer<typeof adminPreviewChange>;
export type AdminPreviewItem = z.infer<typeof adminPreviewItem>;
export type AdminSectionPreview = z.infer<typeof adminSectionPreview>;
export type AdminBotCopyInput = z.infer<typeof adminBotCopyInput>;
export type AdminOutsideInput = z.infer<typeof adminOutsideInput>;
export type AdminAuditEntry = z.infer<typeof adminAuditEntry>;
export type AdminAuditPage = z.infer<typeof adminAuditPage>;
export type AdminAuditFilter = z.infer<typeof adminAuditFilter>;

export const adminConversationSearch = z.object({
  message: z.number().int().positive().optional().catch(undefined),
});
