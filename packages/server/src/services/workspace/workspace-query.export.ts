import { homedir } from 'node:os';
import { join } from 'node:path';
import { workspaceFilesRead } from './workspace-files.utils';
import { WORKSPACE } from './workspace.constants';
import type { WorkspaceExport } from '@repo/contracts/universal';

// SAFETY: read only to bots, but a bot could link inside it before the sandbox existed.
export function workspaceQueryExport(): Promise<WorkspaceExport> {
  const folder = join(homedir(), WORKSPACE.sharedFolder);

  return workspaceFilesRead({ roots: [folder], folder }, () => true);
}
