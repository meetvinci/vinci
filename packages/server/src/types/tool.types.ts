import type { CredentialsService } from '../services/credentials/credentials.service';
import type { DatabaseService } from '../services/database/database.service';
import type { McpService } from '../services/mcp/mcp.service';
import type { SecretService } from '../services/secret/secret.service';
import type { SettingsService } from '../services/settings/settings.service';
import type { Context } from '@earendil-works/chord/context';
import type { ToolAction, ToolSettings } from '@repo/contracts/universal';
import type { ProviderService, RuntimeToolCall } from '@repo/runtime/server';

export interface ToolServiceDeps {
  database: DatabaseService;
  credentials: CredentialsService;
  settings: SettingsService;
  mcp: McpService;
  secrets: SecretService;
  providers: ProviderService;
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
  kind: 'tool' | 'command';
  instructions: string;
  provider: string;
  secrets: Awaited<ReturnType<SecretService['queries']['rules']>>;
  approvalRules: ToolSettings['approvalRules'];
}
