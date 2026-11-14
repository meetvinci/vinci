import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
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

  // SAFETY: the sandbox mounts the shared folder itself, so folders stay in place and only their entries move: a replaced folder would leave the sandbox on the deleted one.
  const workspaceActionImportSwap = async (folder: string, source: string, aside: string): Promise<void> => {
    const current = await readdir(folder, { withFileTypes: true });
    const next = await readdir(source, { withFileTypes: true });
    const names = new Set(next.map((entry) => entry.name));
    await mkdir(aside, { recursive: true, mode: WORKSPACE.directoryMode });

    // SAFETY: one move at a time, so a failed one stops the swap before the draft is removed: no other move then finds its source gone and loses the entry it would replace.
    const removed = current.filter((kept) => !names.has(kept.name));
    await removed.reduce((moved, entry) => moved.then(() => rename(join(folder, entry.name), join(aside, entry.name))), Promise.resolve());

    await next.reduce((moved, entry) => moved.then(async () => {
      const [from, to, away] = [join(source, entry.name), join(folder, entry.name), join(aside, entry.name)];

      if (entry.isDirectory() && current.some((kept) => kept.name === entry.name && kept.isDirectory())) {
        await workspaceActionImportSwap(to, from, away);
        return;
      }

      // SAFETY: a file replaces a file in one rename, so a reader sees it whole; another kind is moved aside first.
      await rename(from, to).catch(async () => {
        await rename(to, away);
        await rename(from, to);
      });
    }), Promise.resolve());
  };

  // SAFETY: a copy a crash or restart interrupted left its draft and moved-aside entries beside the folder; the hub runs one copy per person at a time, so none is in use.
  const leftovers = (await readdir(homedir())).filter((name) => name.startsWith(`${WORKSPACE.sharedFolder}.import-`) || name.startsWith(`${WORKSPACE.sharedFolder}.previous-`));
  await Promise.all(leftovers.map((name) => rm(join(homedir(), name), { recursive: true, force: true })));

  try {
    await mkdir(draft, { recursive: true, mode: WORKSPACE.directoryMode });
    await workspaceFilesWrite({ roots: [draft], folder: draft }, files, () => true);

    const isFolder = await lstat(target).then((stats) => stats.isDirectory()).catch((error: unknown) => match(error)
      .with({ code: 'ENOENT' }, () => false)
      .otherwise(() => {
        throw error;
      }));

    if (isFolder) {
      await workspaceActionImportSwap(target, draft, previous);
      return;
    }

    await rm(target, { force: true });
    await rename(draft, target);
  } finally {
    await rm(draft, { recursive: true, force: true });
    await rm(previous, { recursive: true, force: true });
  }
}
