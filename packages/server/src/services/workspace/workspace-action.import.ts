import { mkdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { match } from 'ts-pattern';
import { workspaceFilesWrite } from './workspace-files.utils';
import { WORKSPACE } from './workspace.constants';
import type { WorkspaceFiles } from '@repo/contracts/universal';

export async function workspaceActionImport({ files }: WorkspaceFiles): Promise<void> {
  const target = join(homedir(), WORKSPACE.sharedFolder);
  const id = crypto.randomUUID();
  const draft = `${target}.import-${id}`;
  const previous = `${target}.previous-${id}`;

  try {
    await mkdir(draft, { recursive: true, mode: WORKSPACE.directoryMode });
    await workspaceFilesWrite(draft, files, () => true);

    const hadPrevious = await rename(target, previous).then(() => true).catch((error: unknown) => match(error)
      .with({ code: 'ENOENT' }, () => false)
      .otherwise(() => {
        throw error;
      }));

    await rename(draft, target).catch(async (error: unknown) => {
      if (hadPrevious) {
        await rename(previous, target);
      }

      throw error;
    });
  } finally {
    await rm(draft, { recursive: true, force: true });
    await rm(previous, { recursive: true, force: true });
  }
}
