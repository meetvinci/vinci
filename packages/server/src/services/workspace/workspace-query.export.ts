import { homedir } from 'node:os';
import { join } from 'node:path';
import { workspaceFilesRead } from './workspace-files.utils';
import { WORKSPACE } from './workspace.constants';
import type { WorkspaceFiles } from '@repo/contracts/universal';

export async function workspaceQueryExport(): Promise<WorkspaceFiles> {
  return { files: await workspaceFilesRead(join(homedir(), WORKSPACE.sharedFolder), () => true) };
}
