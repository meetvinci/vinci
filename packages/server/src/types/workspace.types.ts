import type { BotGetInput, WorkspaceFile } from '@repo/contracts/universal';

export interface WorkspaceServiceDeps {
  root: string;
}

export interface WorkspaceBotFilesParams extends BotGetInput {
  files: WorkspaceFile[];
}
