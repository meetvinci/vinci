import { m } from '@repo/i18n/client';
import type * as ToolTypes from '../../types/tool.types';

export const TOOL_PREVIEW_KEYS = ['command', 'path', 'query', 'name', 'title', 'text', 'emoji'];

export const TOOL_PATH_KEYS = new Set(['path']);

export const TOOL_CODE_KEYS = new Set(['command', 'content']);

export const TOOL_MCP_NAME = /^mcp_(.+)_[0-9a-f]{24}$/u;

export const TOOL_QUESTION = 'bot_question';

export const TOOL_SECRET = 'bot_secret';

export const TOOL_QUESTIONS = new Set([TOOL_QUESTION, TOOL_SECRET]);

export const TOOL_SUBAGENT = 'bot_subagent';

export const TOOL_PEER_NAMES = new Set(['bot_message', 'bot_ask']);

export const TOOL_ARTIFACT_NAMES = new Set(['bot_artifact_create', 'bot_artifact_update']);

export const TOOL_PRESENTATIONS = new Map<string, ToolTypes.ToolPresentationDefinition>([
  ['bash', { label: m.tool_label_command, icon: 'terminal' }],
  ['read', { label: m.tool_label_read_file, icon: 'file' }],
  ['write', { label: m.tool_label_write_file, icon: 'edit' }],
  ['edit', { label: m.tool_label_edit_file, icon: 'edit' }],
  ['tool_search', { label: m.tool_label_search_tools, icon: 'search' }],
  [TOOL_QUESTION, { label: m.tool_label_ask, icon: 'question' }],
  [TOOL_SECRET, { label: m.tool_label_secret, icon: 'secret' }],
  [TOOL_SUBAGENT, { label: m.tool_label_agent, icon: 'bot' }],
  ['bot_subagent_stop', { label: m.tool_label_agent_stop, icon: 'bot' }],
  ['bot_list', { label: m.tool_label_bot_list, icon: 'bot' }],
  ['bot_get', { label: m.tool_label_bot_get, icon: 'bot' }],
  ['bot_create', { label: m.tool_label_bot_create, icon: 'bot' }],
  ['bot_update', { label: m.tool_label_bot_edit, icon: 'bot' }],
  ['bot_swap_models', { label: m.tool_label_bot_swap_models, icon: 'bot' }],
  ['bot_catalog', { label: m.tool_label_bot_catalog, icon: 'bot' }],
  ['bot_model_list', { label: m.tool_label_model_list, icon: 'model' }],
  ['bot_ask', { label: m.tool_label_ask_bot, icon: 'bot' }],
  ['bot_message', { label: m.tool_label_message_bot, icon: 'bot' }],
  ['bot_react', { label: m.tool_label_react, icon: 'bot' }],
  ['bot_history', { label: m.tool_label_history, icon: 'search' }],
  ['bot_search', { label: m.tool_label_search_history, icon: 'search' }],
  ['bot_routine_list', { label: m.tool_label_routines, icon: 'routine' }],
  ['bot_routine_create', { label: m.tool_label_routine_create, icon: 'routine' }],
  ['bot_routine_update', { label: m.tool_label_routine_update, icon: 'routine' }],
  ['bot_routine_run', { label: m.tool_label_routine_run, icon: 'routine' }],
  ['bot_routine_remove', { label: m.tool_label_routine_remove, icon: 'routine' }],
  ['bot_todo_list', { label: m.tool_label_todos, icon: 'todo' }],
  ['bot_todo_create', { label: m.tool_label_todo_create, icon: 'todo' }],
  ['bot_todo_update', { label: m.tool_label_todo_update, icon: 'todo' }],
  ['bot_todo_remove', { label: m.tool_label_todo_remove, icon: 'todo' }],
  ['bot_artifact_list', { label: m.tool_label_artifacts, icon: 'artifact' }],
  ['bot_artifact_get', { label: m.tool_label_artifact_get, icon: 'artifact' }],
  ['bot_artifact_blocks', { label: m.tool_label_artifact_blocks, icon: 'artifact' }],
  ['bot_artifact_create', { label: m.tool_label_artifact_create, icon: 'artifact' }],
  ['bot_artifact_update', { label: m.tool_label_artifact_update, icon: 'artifact' }],
]);

export const TOOL_ACTIVITY_LABELS = new Map<string, ToolTypes.ToolActivityLabel>([
  ['bash', { plain: m.rooms_activity_tool_command, detail: (detail) => m.rooms_activity_tool_command_detail({ detail }) }],
  ['read', { plain: m.rooms_activity_tool_read, detail: (detail) => m.rooms_activity_tool_read_detail({ detail }) }],
  ['write', { plain: m.rooms_activity_tool_write, detail: (detail) => m.rooms_activity_tool_write_detail({ detail }) }],
  ['edit', { plain: m.rooms_activity_tool_edit, detail: (detail) => m.rooms_activity_tool_edit_detail({ detail }) }],
  ['tool_search', { plain: m.rooms_activity_tool_search_tools }],
  ['bot_history', { plain: m.rooms_activity_tool_history }],
  ['bot_search', { plain: m.rooms_activity_tool_history }],
  ['bot_artifact_create', { plain: m.rooms_activity_tool_artifact, detail: (detail) => m.rooms_activity_tool_artifact_detail({ detail }) }],
  ['bot_artifact_update', { plain: m.rooms_activity_tool_artifact, detail: (detail) => m.rooms_activity_tool_artifact_detail({ detail }) }],
  ['bot_todo_create', { plain: m.rooms_activity_tool_todos }],
  ['bot_todo_update', { plain: m.rooms_activity_tool_todos }],
  ['bot_todo_remove', { plain: m.rooms_activity_tool_todos }],
  ['bot_gif', { plain: m.rooms_activity_tool_gif }],
]);

export const TOOL_ACTIVITY_TOPICS = new Map<string, ToolTypes.ToolActivityTopic>([
  ['bash', 'working'],
  ['tool_search', 'working'],
  ['read', 'documents'],
  ['write', 'documentWrite'],
  ['edit', 'documentWrite'],
  ['bot_history', 'history'],
  ['bot_search', 'history'],
  ['bot_artifact_list', 'documents'],
  ['bot_artifact_get', 'documents'],
  ['bot_artifact_blocks', 'documents'],
  ['bot_artifact_create', 'artifact'],
  ['bot_artifact_update', 'artifact'],
  ['bot_todo_list', 'todos'],
  ['bot_todo_create', 'todos'],
  ['bot_todo_update', 'todos'],
  ['bot_todo_remove', 'todos'],
  ['bot_routine_list', 'routines'],
  ['bot_routine_create', 'routines'],
  ['bot_routine_update', 'routines'],
  ['bot_routine_run', 'routines'],
  ['bot_routine_remove', 'routines'],
  ['bot_gif', 'gif'],
]);

export const TOOL_ACTIVITY_TOPIC_PATTERNS: ToolTypes.ToolActivityTopicPattern[] = [
  { topic: 'mail', pattern: /mail|outlook|inbox/u },
  { topic: 'calendar', pattern: /calendar|calendly|meeting|appointment/u },
  { topic: 'messages', pattern: /slack|teams|discord|whatsapp|telegram|message/u },
  { topic: 'data', pattern: /sql|postgres|mysql|mariadb|supabase|database|\bdb\b|query|table|mongo|redis|bigquery|snowflake|clickhouse|airtable|sheet|excel|crm|analytics/u },
  { topic: 'documents', pattern: /\bfiles?\b|folder|\bdocs?\b|document|drive|dropbox|notion|confluence|pdf|wiki|note/u },
  { topic: 'web', pattern: /web|search|browse|fetch|scrape|crawl|url|http|brave|tavily|perplexity|google/u },
];

export const TOOL_ACTIVITY_TOPIC_LABELS = {
  data: [m.rooms_activity_friendly_data, m.rooms_activity_friendly_data_gather],
  web: [m.rooms_activity_friendly_web, m.rooms_activity_friendly_web_lookup],
  documents: [m.rooms_activity_friendly_documents, m.rooms_activity_friendly_documents_files],
  documentWrite: [m.rooms_activity_friendly_document_write],
  mail: [m.rooms_activity_friendly_mail],
  calendar: [m.rooms_activity_friendly_calendar],
  messages: [m.rooms_activity_friendly_messages],
  history: [m.rooms_activity_tool_history],
  todos: [m.rooms_activity_tool_todos],
  routines: [m.rooms_activity_friendly_routines],
  artifact: [m.rooms_activity_tool_artifact],
  gif: [m.rooms_activity_tool_gif],
  working: [m.rooms_activity_friendly_working, m.rooms_activity_friendly_working_ready],
} as const satisfies Record<ToolTypes.ToolActivityTopic, readonly [() => string, ...(() => string)[]]>;

export const TOOL_APPROVAL_SENTENCES = new Map<string, Map<string, ToolTypes.ToolApprovalSentence>>([
  ['https://mcp.cloudflare.com/mcp', new Map([
    ['execute', { sentence: m.tool_approval_cloudflare_execute, keys: [] }],
  ])],
  ['https://mcp.linear.app/mcp', new Map([
    ['create_issue', { sentence: m.tool_approval_linear_create_issue, keys: ['title'] }],
    ['update_issue', { sentence: m.tool_approval_linear_update_issue, keys: ['id', 'identifier'] }],
    ['save_issue', { sentence: m.tool_approval_linear_save_issue, keys: ['id', 'title'] }],
    ['create_comment', { sentence: m.tool_approval_linear_create_comment, keys: ['issueId', 'issue'] }],
    ['save_comment', { sentence: m.tool_approval_linear_create_comment, keys: ['issueId', 'issue'] }],
    ['delete_comment', { sentence: m.tool_approval_linear_delete_comment, keys: [] }],
    ['create_project', { sentence: m.tool_approval_linear_create_project, keys: ['name'] }],
    ['update_project', { sentence: m.tool_approval_linear_update_project, keys: ['id', 'name'] }],
    ['save_project', { sentence: m.tool_approval_linear_update_project, keys: ['id', 'name'] }],
    ['create_issue_label', { sentence: m.tool_approval_linear_create_label, keys: ['name'] }],
  ])],
  ['https://mcp.notion.com/mcp', new Map([
    ['notion-create-pages', { sentence: m.tool_approval_notion_create_pages, keys: [] }],
    ['notion-update-page', { sentence: m.tool_approval_notion_update_page, keys: ['page_id'] }],
    ['notion-move-pages', { sentence: m.tool_approval_notion_move_pages, keys: [] }],
    ['notion-duplicate-page', { sentence: m.tool_approval_notion_duplicate_page, keys: ['page_id'] }],
    ['notion-create-database', { sentence: m.tool_approval_notion_create_database, keys: [] }],
    ['notion-update-database', { sentence: m.tool_approval_notion_update_database, keys: [] }],
    ['notion-update-data-source', { sentence: m.tool_approval_notion_update_database, keys: [] }],
    ['notion-create-comment', { sentence: m.tool_approval_notion_create_comment, keys: [] }],
  ])],
  ['https://mcp.sentry.dev/mcp', new Map([
    ['update_issue', { sentence: m.tool_approval_sentry_update_issue, keys: ['issueId', 'issueUrl'] }],
    ['create_team', { sentence: m.tool_approval_sentry_create_team, keys: ['name'] }],
    ['create_project', { sentence: m.tool_approval_sentry_create_project, keys: ['name'] }],
    ['update_project', { sentence: m.tool_approval_sentry_update_project, keys: ['projectSlug'] }],
    ['create_dsn', { sentence: m.tool_approval_sentry_create_dsn, keys: [] }],
    ['analyze_issue_with_seer', { sentence: m.tool_approval_sentry_analyze_issue, keys: ['issueId', 'issueUrl'] }],
  ])],
]);

export const TOOL_POLICY_CHOICES = ['default', 'allow', 'ask'] as const satisfies ToolTypes.ToolPolicyChoice[];
