import { join } from 'node:path';
import { workspaceFilesIsBotFile, workspaceFilesRead } from './workspace-files.utils';
import type { WorkspaceServiceDeps } from '../../types/workspace.types';
import type { BotGetInput, WorkspaceFile } from '@repo/contracts/universal';

export function workspaceQueryBotFiles({ root }: WorkspaceServiceDeps, { botId }: BotGetInput): Promise<WorkspaceFile[]> {
  return workspaceFilesRead(join(root, 'agents', botId), workspaceFilesIsBotFile);
}
