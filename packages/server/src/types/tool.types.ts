import type { CredentialsService } from '../services/credentials/credentials.service';
import type { DatabaseService } from '../services/database/database.service';
import type { McpService } from '../services/mcp/mcp.service';
import type { SettingsService } from '../services/settings/settings.service';
import type { Context } from '@earendil-works/chord/context';
import type { ToolAction, ToolSettings } from '@repo/contracts/universal';
import type { RuntimeToolCall } from '@repo/runtime/server';

export interface ToolServiceDeps {
  database: DatabaseService;
  credentials: CredentialsService;
  settings: SettingsService;
  mcp: McpService;
}

export interface ToolTargetParams {
  botId: string;
  toolName: string;
}

export interface ToolTarget extends Pick<ToolAction, 'server' | 'serverName' | 'tool'> {
  declaresReadOnly: boolean;
}

export interface ToolAuthorizeParams extends RuntimeToolCall {
  context: Context;
}

export interface ToolJudgeParams extends ToolAuthorizeParams {
  instructions: string;
  approvalRules: ToolSettings['approvalRules'];
}
