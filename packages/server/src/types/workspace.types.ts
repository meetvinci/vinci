import type { BotGetInput, WorkspaceFile } from '@repo/contracts/universal';

export interface WorkspaceServiceDeps {
  root: string;
}

export interface WorkspaceBotFilesParams extends BotGetInput {
  files: WorkspaceFile[];
}

export interface WorkspaceFolder {
  roots: string[];
  folder: string;
  names?: readonly string[];
}

export interface WorkspaceListing {
  files: string[];
  skipped: string[];
}
