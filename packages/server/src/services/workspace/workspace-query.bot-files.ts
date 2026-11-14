import { join } from 'node:path';
import { INSTRUCTION } from '@repo/runtime/server';
import { workspaceFilesIsBotFile, workspaceFilesRead } from './workspace-files.utils';
import { WORKSPACE } from './workspace.constants';
import type { WorkspaceServiceDeps } from '../../types/workspace.types';
import type { BotGetInput, WorkspaceExport } from '@repo/contracts/universal';

export function workspaceQueryBotFiles({ root }: WorkspaceServiceDeps, { botId }: BotGetInput): Promise<WorkspaceExport> {
  return workspaceFilesRead({
    roots: [join(root, 'agents')],
    folder: join(root, 'agents', botId),
    names: [...INSTRUCTION.names, ...WORKSPACE.botFolders],
  }, workspaceFilesIsBotFile);
}
