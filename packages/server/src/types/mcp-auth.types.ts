import type { AuthService } from '../services/auth/auth.service';
import type { BotService } from '../services/bot/bot.service';
import type { McpService } from '../services/mcp/mcp.service';
import type { McpAuthCompleteInput, McpAuthStartInput, McpAuthTarget } from '@repo/contracts/universal';
import type { McpAuthService } from '@repo/runtime/server';

export interface McpAuthServiceDeps {
  bots: BotService;
  mcp: McpService;
  oauth: McpAuthService;
  auth: AuthService;
}

export interface McpAuthTargetParams extends McpAuthTarget {
  deviceId: string | null;
}

export interface McpAuthStartParams extends McpAuthStartInput {
  deviceId: string | null;
  authorization: string | null | undefined;
}

export interface McpAuthCompleteParams extends McpAuthCompleteInput {
  deviceId: string | null;
}
