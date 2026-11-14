import { join } from 'node:path';
import { workspaceFilesIsBotFile, workspaceFilesWrite } from './workspace-files.utils';
import type { WorkspaceBotFilesParams, WorkspaceServiceDeps } from '../../types/workspace.types';

export function workspaceActionBotFiles({ root }: WorkspaceServiceDeps, { botId, files }: WorkspaceBotFilesParams): Promise<void> {
  return workspaceFilesWrite({ roots: [join(root, 'agents')], folder: join(root, 'agents', botId) }, files, workspaceFilesIsBotFile);
}
