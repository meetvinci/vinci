import { WORKSPACE as WORKSPACE_LIMITS } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { closeSync, fstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { match, P } from 'ts-pattern';
import { runtimeBotFilesList, runtimeBotFilesOpen, runtimeBotFilesReadInto, runtimeBotFilesWrite } from '@repo/runtime/native';
import { INSTRUCTION } from '@repo/runtime/server';
import { WORKSPACE } from './workspace.constants';
import type { WorkspaceFolder, WorkspaceListing } from '../../types/workspace.types';
import type { WorkspaceExport, WorkspaceFile } from '@repo/contracts/universal';

// SAFETY: a link, hard link or special file a bot left is not followed but named in `skipped`, for whoever copies it.
export async function workspaceFilesRead({ roots, folder, names }: WorkspaceFolder, isIncluded: (path: string) => boolean): Promise<WorkspaceExport> {
  const listing = workspaceFilesList(roots, folder, folder, names);
  const paths = listing.files.map((file) => workspaceFilesRelative(folder, file)).filter((path) => isIncluded(path)).sort();

  if (paths.length > WORKSPACE_LIMITS.maxFiles) {
    throw new Errors.VALIDATION_ERROR({ fields: { files: { message: 'validation_workspace_too_large' } }, internal: `${paths.length} files in ${folder}` });
  }

  const files: WorkspaceFile[] = [];
  const skipped = listing.skipped.map((file) => workspaceFilesRelative(folder, file));
  let total = 0;

  for (const path of paths) {
    const read = workspaceFilesReadOne(roots, join(folder, path), WORKSPACE_LIMITS.maxBytes - total);

    if (read) {
      total += read.content.byteLength;
      files.push({
        path,
        content: read.content.toString('base64'),
        isExecutable: (read.mode & 0o100) !== 0,
      });
    } else {
      skipped.push(path);
    }
  }

  return { files, skipped: skipped.sort() };
}

export async function workspaceFilesWrite({ roots, folder }: WorkspaceFolder, files: WorkspaceFile[], isIncluded: (path: string) => boolean): Promise<void> {
  const refused = files.find(({ path }) => !isIncluded(path) || relative(folder, join(folder, path)).startsWith('..'));

  if (refused) {
    throw new Errors.VALIDATION_ERROR({ fields: { files: { message: 'validation_workspace_path' } }, internal: `Refused ${refused.path}` });
  }

  try {
    for (const { path, content, isExecutable } of files) {
      runtimeBotFilesWrite(roots, join(folder, path), Buffer.from(content, 'base64'), {
        mode: match(isExecutable).with(true, () => WORKSPACE.executableMode).otherwise(() => WORKSPACE.fileMode),
      });
    }
  } catch (error) {
    throw match(error)
      .with({ code: P.union('ENOSPC', 'EDQUOT') }, () => new Errors.DISK_FULL({ cause: error }))
      .otherwise(() => error);
  }
}

export function workspaceFilesIsBotFile(path: string): boolean {
  return match(path.split('/'))
    .with([P.string], ([name]) => INSTRUCTION.names.includes(name))
    .with([P.string, P.string, ...P.array(P.string)], ([folder]) => WORKSPACE.botFolders.some((allowed) => allowed === folder))
    .otherwise(() => false);
}

function workspaceFilesList(roots: string[], top: string, folder: string, names?: readonly string[]): WorkspaceListing {
  try {
    const entries = runtimeBotFilesList(roots, folder)
      .filter((entry) => !WORKSPACE.skippedNames.some((name) => name === entry.name))
      .filter((entry) => folder !== top || names === undefined || names.includes(entry.name));

    return entries.reduce<WorkspaceListing>((listing, entry) => {
      const path = join(folder, entry.name);

      const found = match(entry)
        .when((item) => item.isDirectory(), () => workspaceFilesList(roots, top, path))
        .when((item) => item.isFile(), () => ({ files: [path], skipped: [] }))
        .otherwise(() => ({ files: [], skipped: [path] }));

      return { files: [...listing.files, ...found.files], skipped: [...listing.skipped, ...found.skipped] };
    }, { files: [], skipped: [] });
  } catch (error) {
    return match(error)
      .with({ code: 'ENOENT' }, () => ({ files: [], skipped: [] }))
      .with({ code: 'FORBIDDEN' }, () => ({ files: [], skipped: [folder] }))
      .otherwise(() => {
        throw error;
      });
  }
}

function workspaceFilesReadOne(roots: string[], file: string, maxBytes: number) {
  let descriptor: number;

  try {
    descriptor = runtimeBotFilesOpen(roots, file, maxBytes);
  } catch (error) {
    return match(error)
      .with({ code: P.union('FORBIDDEN', 'ENOENT') }, () => undefined)
      .with({ code: 'VALIDATION_ERROR' }, () => {
        throw new Errors.VALIDATION_ERROR({ fields: { files: { message: 'validation_workspace_too_large' } }, internal: `More than ${WORKSPACE_LIMITS.maxBytes} bytes below ${file}` });
      })
      .otherwise(() => {
        throw error;
      });
  }

  try {
    const { size, mode } = fstatSync(descriptor);
    const content = Buffer.alloc(Math.min(size, maxBytes));

    return { content: content.subarray(0, runtimeBotFilesReadInto(descriptor, content, 0)), mode };
  } finally {
    closeSync(descriptor);
  }
}

function workspaceFilesRelative(folder: string, file: string) {
  return relative(folder, file).split(sep).join('/') || '.';
}
