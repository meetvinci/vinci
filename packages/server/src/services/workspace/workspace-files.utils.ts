import { WORKSPACE as WORKSPACE_LIMITS } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { match, P } from 'ts-pattern';
import { INSTRUCTION } from '@repo/runtime/server';
import { WORKSPACE } from './workspace.constants';
import type { WorkspaceFile } from '@repo/contracts/universal';

async function workspaceFilesList(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch((error: unknown) => match(error)
    .with({ code: 'ENOENT' }, () => [])
    .otherwise(() => {
      throw error;
    }));

  const nested = await Promise.all(entries
    .filter((entry) => !WORKSPACE.skippedNames.some((name) => name === entry.name))
    .map(async (entry) => match(entry)
      .when((item) => item.isDirectory(), () => workspaceFilesList(join(folder, entry.name)))
      .when((item) => item.isFile(), async () => [join(folder, entry.name)])
      .otherwise(async () => [])));

  return nested.flat();
}

export async function workspaceFilesRead(root: string, isIncluded: (path: string) => boolean): Promise<WorkspaceFile[]> {
  const paths = (await workspaceFilesList(root))
    .map((file) => relative(root, file).split(sep).join('/'))
    .filter((path) => isIncluded(path))
    .sort();

  if (paths.length > WORKSPACE_LIMITS.maxFiles) {
    throw new Errors.VALIDATION_ERROR({ fields: { files: { message: 'validation_workspace_too_large' } }, internal: `${paths.length} files in ${root}` });
  }

  const sizes = await Promise.all(paths.map(async (path) => (await stat(join(root, path))).size));

  if (sizes.reduce((sum, size) => sum + size, 0) > WORKSPACE_LIMITS.maxBytes) {
    throw new Errors.VALIDATION_ERROR({ fields: { files: { message: 'validation_workspace_too_large' } }, internal: `More than ${WORKSPACE_LIMITS.maxBytes} bytes in ${root}` });
  }

  return Promise.all(paths.map(async (path) => {
    const file = join(root, path);

    const [content, { mode }] = await Promise.all([
      readFile(file),
      stat(file),
    ]);

    return { path, content: content.toString('base64'), isExecutable: (mode & 0o100) !== 0 };
  }));
}

export async function workspaceFilesWrite(root: string, files: WorkspaceFile[], isIncluded: (path: string) => boolean): Promise<void> {
  const refused = files.find(({ path }) => !isIncluded(path) || relative(root, join(root, path)).startsWith('..'));

  if (refused) {
    throw new Errors.VALIDATION_ERROR({ fields: { files: { message: 'validation_workspace_path' } }, internal: `Refused ${refused.path}` });
  }

  await Promise.all(files.map(async ({ path, content, isExecutable }) => {
    const target = join(root, path);

    await mkdir(dirname(target), { recursive: true, mode: WORKSPACE.directoryMode });
    await writeFile(target, Buffer.from(content, 'base64'), { mode: match(isExecutable).with(true, () => WORKSPACE.executableMode).otherwise(() => WORKSPACE.fileMode) });
  }));
}

export function workspaceFilesIsBotFile(path: string): boolean {
  return match(path.split('/'))
    .with([P.string], ([name]) => INSTRUCTION.names.includes(name))
    .with([P.string, P.string, ...P.array(P.string)], ([folder]) => WORKSPACE.botFolders.some((allowed) => allowed === folder))
    .otherwise(() => false);
}
