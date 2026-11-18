import { ORPCError } from '@orpc/client';
import { adminRelayRefusal, adminSectionId } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { m } from '@repo/i18n/client';
import { linkOptions } from '@tanstack/react-router';
import { match, P } from 'ts-pattern';
import { ADMIN } from '@/services/admin/admin.constants';
import { SETTINGS_NAV } from '@/services/settings/settings.constants';
import type * as AdminTypes from '@/types/admin.types';
import type { SectionScope } from '@/types/section.types';
import type { ChatMessage } from '@repo/client/client';
import type * as UniversalTypes from '@repo/contracts/universal';

export function adminSectionScope(userId: string): SectionScope {
  return {
    isAdmin: true,
    settings: {
      section: (tab) => linkOptions({
        to: '/admin/users/$userId/settings/$tab',
        params: { userId, tab },
        replace: true,
      }),
      model: (model) => linkOptions({
        to: '/admin/users/$userId/settings/models/$model',
        params: { userId, model },
        replace: true,
      }),
      providerLogout: (providerId) => linkOptions({
        to: '/admin/users/$userId/settings/providers/$providerId/logout',
        params: { userId, providerId },
        replace: true,
      }),
      deviceRevoke: (deviceId) => linkOptions({
        to: '/admin/users/$userId/devices/$deviceId/revoke',
        params: { userId, deviceId },
        replace: true,
      }),
    },
    bots: {
      list: linkOptions({
        to: '/admin/users/$userId/bots',
        params: { userId },
        replace: true,
      }),
      create: linkOptions({
        to: '/admin/users/$userId/bots/create',
        params: { userId },
        replace: true,
      }),
      section: (botId, tab) => linkOptions({
        to: '/admin/users/$userId/bots/$botId/$tab',
        params: { userId, botId, tab },
        replace: true,
      }),
      skillsLocal: (botId) => linkOptions({
        to: '/admin/users/$userId/bots/$botId/skills/local',
        params: { userId, botId },
        replace: true,
      }),
      reset: (botId) => linkOptions({
        to: '/admin/users/$userId/bots/$botId/reset',
        params: { userId, botId },
        replace: true,
      }),
      remove: (botId) => linkOptions({
        to: '/admin/users/$userId/bots/$botId/delete',
        params: { userId, botId },
        replace: true,
      }),
      mcpRemove: (botId, server) => linkOptions({ to: '/admin/users/$userId/bots/$botId/mcp/$server/remove', params: { userId, botId, server } }),
      mcpEdit: (botId) => linkOptions({
        to: '/admin/users/$userId/bots/$botId/mcp/edit',
        params: { userId, botId },
        replace: true,
      }),
    },
    rooms: null,
  };
}

export function adminRpcPrefix(userId: string): string {
  return `admin-user:${userId}`;
}

export function adminIsSectionRefused(error: Error): boolean {
  if (!(error instanceof ORPCError)) {
    return false;
  }

  return adminRelayRefusal.safeParse(error.data).success;
}

export function adminBotCopyProblem({ copies, bots }: AdminTypes.AdminBotCopyProblemParams): string | null {
  const failed = copies.filter((copy) => copy.botId === null).map((copy) => {
    const name = bots.find((bot) => bot.id === copy.from)?.name ?? copy.from;

    return copy.error ? `${name} (${copy.error})` : name;
  });

  return failed.length > 0 ? m.admin_bots_copy_partial({ bots: failed.join(', ') }) : null;
}

export function adminBotCopySkipped({ copies, bots }: AdminTypes.AdminBotCopyProblemParams): string | null {
  const skipped = copies.filter((copy) => copy.skipped !== undefined && copy.skipped.length > 0).map((copy) => {
    const name = bots.find((bot) => bot.id === copy.from)?.name ?? copy.from;

    return `${name} (${copy.skipped?.join(', ') ?? ''})`;
  });

  return skipped.length > 0 ? m.admin_bots_copy_skipped({ files: skipped.join('; ') }) : null;
}

export function adminSectionLabel(section: UniversalTypes.SettingsSection): string {
  return SETTINGS_NAV.find((item) => item.id === section)?.label() ?? section;
}

export function adminIsPreviewStale(error: Error | null): boolean {
  return error instanceof ORPCError && error.code === 'CONFLICT';
}

export function adminPreviewKind(kind: UniversalTypes.AdminPreviewKind): string {
  return match(kind)
    .with('provider', () => m.admin_preview_kind_provider())
    .with('modelSetting', () => m.admin_preview_kind_model_setting())
    .with('chatSetting', () => m.admin_preview_kind_chat_setting())
    .with('toolSetting', () => m.admin_preview_kind_tool_setting())
    .with('secret', () => m.admin_preview_kind_secret())
    .with('secretSetting', () => m.admin_preview_kind_secret_setting())
    .with('skill', () => m.admin_preview_kind_skill())
    .with('instruction', () => m.admin_preview_kind_instruction())
    .with('plugin', () => m.admin_preview_kind_plugin())
    .with('mcpServer', () => m.admin_preview_kind_mcp_server())
    .with('file', () => m.admin_preview_kind_file())
    .with('sourceSetting', () => m.admin_preview_kind_source_setting())
    .exhaustive();
}

export function adminPreviewName({ kind, name }: UniversalTypes.AdminPreviewItem): string | null {
  return match({ kind, name })
    .with({ kind: 'modelSetting', name: 'defaultModel' }, () => m.admin_preview_setting_default_model())
    .with({ kind: 'chatSetting', name: 'whenBusy' }, () => m.admin_preview_setting_when_busy())
    .with({ kind: 'chatSetting', name: 'hideVerbose' }, () => m.admin_preview_setting_hide_verbose())
    .with({ kind: 'chatSetting', name: 'gifProvider' }, () => m.admin_preview_setting_gif_provider())
    .with({ kind: 'toolSetting', name: 'approvalRules' }, () => m.admin_preview_setting_approval_rules())
    .with({ kind: 'toolSetting', name: 'approvalTimeoutMinutes' }, () => m.admin_preview_setting_approval_timeout())
    .with({ kind: 'toolSetting', name: 'jevApiKey' }, () => m.admin_preview_setting_jev_key())
    .with({ kind: 'secretSetting', name: 'mode' }, () => m.admin_preview_setting_secret_mode())
    .with({ kind: 'sourceSetting', name: 'skills' }, () => m.admin_preview_setting_skills())
    .with({ kind: 'sourceSetting', name: 'instructions' }, () => m.admin_preview_setting_instructions())
    .with({ kind: 'sourceSetting', name: 'plugins' }, () => m.admin_preview_setting_plugins())
    .with({ kind: 'sourceSetting', name: 'mcp' }, () => m.admin_preview_setting_mcp())
    .otherwise(() => null);
}

export function adminProblem({ error, failed }: AdminTypes.AdminProblemParams): string {
  return match(error)
    .with(P.instanceOf(ORPCError), (failure) => match(failure.code)
      .with('UNAUTHORIZED', () => m.admin_signed_out())
      .with('FORBIDDEN', () => m.admin_forbidden())
      .otherwise(() => failed))
    .otherwise(() => failed);
}

export async function adminRequest<T>({ path, schema, method = 'GET', body }: AdminTypes.AdminRequestParams<T>): Promise<T> {
  const response = await fetch(`${ADMIN.apiPath}${path}`, {
    method,
    headers: method === 'GET' ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    throw match(response.status)
      .with(0, 401, () => new Errors.UNAUTHORIZED({ internal: `Admin API ${method} ${path}: signed out` }))
      .with(403, () => new Errors.FORBIDDEN({ internal: `Admin API ${method} ${path}` }))
      .with(404, () => new Errors.NOT_FOUND({ internal: `Admin API ${method} ${path}` }))
      .with(409, () => new Errors.CONFLICT({ internal: `Admin API ${method} ${path}` }))
      .otherwise((status) => new Errors.INTERNAL_ERROR({ internal: `Admin API ${method} ${path}: ${String(status)}` }));
  }

  const text = await response.text();

  return schema.parse(text === '' ? {} : JSON.parse(text));
}

export function adminStateLabel(state: UniversalTypes.AdminUserState): { label: string; tone: 'success' | 'warning' | 'default' } {
  return match(state)
    .with('running', () => ({ label: m.admin_state_running(), tone: 'success' as const }))
    .with('starting', () => ({ label: m.admin_state_starting(), tone: 'warning' as const }))
    .with('stopped', () => ({ label: m.admin_state_stopped(), tone: 'default' as const }))
    .with('unknown', () => ({ label: m.admin_state_unknown(), tone: 'default' as const }))
    .exhaustive();
}

export function adminQueriesStatus(results: { isError: boolean; isPending: boolean }[]): AdminTypes.AdminQueriesStatus {
  return match(results)
    .when((all) => all.some((result) => result.isError), () => 'error' as const)
    .when((all) => all.some((result) => result.isPending), () => 'pending' as const)
    .otherwise(() => 'success' as const);
}

export function adminAuditPath({ filter, cursor }: AdminTypes.AdminAuditPathParams): string {
  const search = new URLSearchParams();

  Object.entries({ ...filter, cursor: cursor > 0 ? String(cursor) : undefined }).forEach(([name, value]) => match(value)
    .with(P.string, (text) => search.set(name, text))
    .otherwise(() => undefined));

  return search.size > 0 ? `/audit?${search.toString()}` : '/audit';
}

function adminAuditSection(detail: string | null): string {
  const section = adminSectionId.safeParse(detail);

  return section.success ? adminSectionLabel(section.data) : detail ?? '';
}

export function adminAuditSentence({ action, detail }: UniversalTypes.AdminAuditEntry): string {
  return match(action)
    .with('conversation/list', () => m.admin_activity_read_list())
    .with('conversation/history', () => m.admin_activity_read_history())
    .with('conversation/search', () => m.admin_activity_read_search())
    .with('conversation/questions', () => m.admin_activity_read_questions())
    .with('tools/pending', () => m.admin_activity_read_approvals())
    .with('artifacts/get', () => m.admin_activity_read_artifact())
    .with('routines/list', () => m.admin_activity_read_routines())
    .with('todos/list', () => m.admin_activity_read_todos())
    .with('attachments/download', () => m.admin_activity_read_file())
    .with('attachments/poster', () => m.admin_activity_read_poster())
    .with('outside/load', () => m.admin_activity_outside_load())
    .with('users/create', () => m.admin_activity_user_create({ email: detail ?? '' }))
    .with('users/update', () => m.admin_activity_user_update())
    .with('users/enable', () => m.admin_activity_user_enable())
    .with('users/disable', () => m.admin_activity_user_disable())
    .with('users/remove', () => m.admin_activity_user_remove())
    .with('admins/add', () => m.admin_activity_admin_add({ email: detail ?? '' }))
    .with('admins/remove', () => m.admin_activity_admin_remove({ email: detail ?? '' }))
    .with('sections/global', () => m.admin_activity_section_global({ section: adminAuditSection(detail) }))
    .with('sections/overridden', () => m.admin_activity_section_overridden({ section: adminAuditSection(detail) }))
    .with('global/sync', () => (detail ? m.admin_activity_sync_section({ section: adminAuditSection(detail) }) : m.admin_activity_sync()))
    .with('bots/copy', () => m.admin_activity_bots_copy({ count: detail ?? '' }))
    .otherwise((procedure) => m.admin_activity_change({ procedure }));
}

export function adminConversationWaiting(messages: ChatMessage[], approvals: UniversalTypes.ToolApproval[]): ChatMessage[] {
  const waiting = new Map(approvals.map((approval) => [`${approval.toolName}:${JSON.stringify(approval.arguments)}`, approval]));

  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => match(part)
      .with({ type: 'dynamic-tool', state: 'input-available' }, (tool) => match(waiting.get(`${tool.toolName}:${JSON.stringify(tool.input)}`))
        .with(P.nonNullable, (approval) => ({ ...tool, state: 'approval-requested' as const, approval: { id: String(approval.id) } }))
        .otherwise(() => tool))
      .otherwise(() => part)),
  }));
}
