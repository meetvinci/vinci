import { Errors } from '@repo/errors/universal';
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readlinkSync,
  readSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { match, P } from 'ts-pattern';
import { RUNTIME_BOT_FILES } from './runtime-bot-files.constants';
import type { RuntimeBotFilesFolder, RuntimeBotFilesWriteOptions } from '../../types/runtime-bot-files.types';
import type { Dirent } from 'node:fs';

export function runtimeBotFilesOpen(roots: string[], path: string, maxBytes: number): number {
  const descriptor = runtimeBotFilesTry(path, () => openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOCTTY));

  try {
    const info = fstatSync(descriptor);

    match({
      isInside: runtimeBotFilesIsInside(roots, runtimeBotFilesWhere(descriptor, path)),
      isFile: info.isFile(),
      links: info.nlink,
    })
      .with({ isInside: false }, () => runtimeBotFilesRefuse(path, 'opens a file outside the bot folders'))
      .with({ isFile: false }, () => runtimeBotFilesRefuse(path, 'is not a regular file'))
      .with({ links: P.number.gt(1) }, () => runtimeBotFilesRefuse(path, 'is a hard link'))
      .otherwise(() => undefined);

    if (info.size > maxBytes) {
      throw new Errors.VALIDATION_ERROR({ fields: { path: { message: 'validation_file_size' } }, internal: `${path} has ${info.size} bytes, over ${maxBytes}` });
    }

    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

export function runtimeBotFilesRead(roots: string[], path: string, maxBytes: number): Buffer {
  const descriptor = runtimeBotFilesOpen(roots, path, maxBytes);

  try {
    // SAFETY: a bot can grow the file after the size check, so read no more than was checked.
    const bytes = Buffer.alloc(Math.min(fstatSync(descriptor).size, maxBytes));
    return bytes.subarray(0, runtimeBotFilesReadInto(descriptor, bytes, 0));
  } finally {
    closeSync(descriptor);
  }
}

export function runtimeBotFilesReadInto(descriptor: number, bytes: Uint8Array, position: number, offset = 0): number {
  const count = offset === bytes.length ? 0 : readSync(descriptor, bytes, offset, bytes.length - offset, position + offset);
  return count === 0 ? offset : runtimeBotFilesReadInto(descriptor, bytes, position, offset + count);
}

export function runtimeBotFilesWrite(roots: string[], path: string, bytes: Uint8Array, { mode, isExclusive = false }: RuntimeBotFilesWriteOptions) {
  const folder = runtimeBotFilesFolder(roots, dirname(path), true);
  const target = `${folder.base}/${basename(path)}`;

  try {
    const exclusive = isExclusive ? constants.O_EXCL : 0;
    const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK | exclusive;
    const descriptor = runtimeBotFilesTry(path, () => openSync(target, flags, mode));

    try {
      const info = fstatSync(descriptor);

      match({ isFile: info.isFile(), links: info.nlink })
        .with({ isFile: false }, () => runtimeBotFilesRefuse(path, 'is not a regular file'))
        .with({ links: P.number.gt(1) }, () => runtimeBotFilesRefuse(path, 'is a hard link'))
        .otherwise(() => undefined);

      ftruncateSync(descriptor, 0);
      fchmodSync(descriptor, mode);
      runtimeBotFilesWriteFrom(descriptor, bytes, 0);
    } finally {
      closeSync(descriptor);
    }
  } finally {
    closeSync(folder.descriptor);
  }
}

export function runtimeBotFilesMakeFolder(roots: string[], path: string) {
  closeSync(runtimeBotFilesFolder(roots, path, true).descriptor);
}

export function runtimeBotFilesList(roots: string[], path: string): Dirent[] {
  const folder = runtimeBotFilesFolder(roots, path, false);

  try {
    return readdirSync(folder.base, { withFileTypes: true });
  } finally {
    closeSync(folder.descriptor);
  }
}

export function runtimeBotFilesRemove(roots: string[], path: string) {
  const folder = runtimeBotFilesTryFolder(roots, dirname(path));

  if (folder) {
    try {
      runtimeBotFilesRemoveEntry(folder.base, basename(path), 1);
    } finally {
      closeSync(folder.descriptor);
    }
  }
}

function runtimeBotFilesTryFolder(roots: string[], path: string): RuntimeBotFilesFolder | undefined {
  try {
    return runtimeBotFilesFolder(roots, path, false);
  } catch (error) {
    return match(error)
      .with({ code: 'ENOENT' }, () => undefined)
      .otherwise(() => {
        throw error;
      });
  }
}

function runtimeBotFilesRemoveEntry(base: string, name: string, attempt: number): void {
  const target = `${base}/${name}`;

  try {
    const info = lstatSync(target, { throwIfNoEntry: false });

    if (info?.isDirectory()) {
      const descriptor = openSync(target, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);

      try {
        const inner = runtimeBotFilesBase(descriptor, target);

        for (const child of readdirSync(inner)) {
          runtimeBotFilesRemoveEntry(inner, child, 1);
        }
      } finally {
        closeSync(descriptor);
      }

      rmdirSync(target);
    } else if (info) {
      unlinkSync(target);
    }
  } catch (error) {
    // SAFETY: the bot can swap an entry between two steps (a folder for a link, or add files), so look again.
    match({ error, attempt })
      .with({ error: { code: 'ENOENT' } }, () => undefined)
      .with({ error: { code: P.union('ELOOP', 'ENOTDIR', 'EISDIR', 'EPERM', 'ENOTEMPTY', 'EEXIST') }, attempt: P.number.lt(RUNTIME_BOT_FILES.removeAttempts) }, () => {
        runtimeBotFilesRemoveEntry(base, name, attempt + 1);
      })
      .otherwise(() => {
        throw error;
      });
  }
}

// SAFETY: one folder at a time from its root, each opened folder checked, so no name changed later moves work out of the roots.
function runtimeBotFilesFolder(roots: string[], path: string, shouldCreate: boolean): RuntimeBotFilesFolder {
  const target = resolve(path);
  const root = roots.map((item) => resolve(item)).find((item) => target === item || target.startsWith(`${item}${sep}`));

  if (root === undefined) {
    return runtimeBotFilesRefuse(path, 'is outside the bot folders');
  }

  const start = { descriptor: openSync(root, constants.O_RDONLY | constants.O_DIRECTORY), path: root, base: root };

  return relative(root, target).split(sep).filter(Boolean).reduce((folder, part) => {
    try {
      const next = `${folder.base}/${part}`;

      if (shouldCreate) {
        runtimeBotFilesMakeName(next);
      }

      const descriptor = runtimeBotFilesTry(path, () => openSync(next, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NONBLOCK));

      try {
        const current = join(folder.path, part);

        if (!runtimeBotFilesIsInside(roots, runtimeBotFilesWhere(descriptor, current))) {
          runtimeBotFilesRefuse(path, 'leads outside the bot folders');
        }

        return { descriptor, path: current, base: runtimeBotFilesBase(descriptor, current) };
      } catch (error) {
        closeSync(descriptor);
        throw error;
      }
    } finally {
      closeSync(folder.descriptor);
    }
  }, start);
}

function runtimeBotFilesMakeName(path: string) {
  try {
    mkdirSync(path, { mode: RUNTIME_BOT_FILES.directoryMode });
  } catch (error) {
    match(error)
      .with({ code: 'EEXIST' }, () => undefined)
      .otherwise(() => {
        throw error;
      });
  }
}

function runtimeBotFilesWriteFrom(descriptor: number, bytes: Uint8Array, offset: number): void {
  if (offset < bytes.length) {
    runtimeBotFilesWriteFrom(descriptor, bytes, offset + writeSync(descriptor, bytes, offset, bytes.length - offset));
  }
}

// SAFETY: on Linux /proc/self/fd/N is the open folder itself, so renaming or relinking anything above it moves nothing below.
function runtimeBotFilesBase(descriptor: number, path: string) {
  return process.platform === 'linux' ? `/proc/self/fd/${descriptor}` : path;
}

function runtimeBotFilesWhere(descriptor: number, path: string) {
  return process.platform === 'linux' ? readlinkSync(`/proc/self/fd/${descriptor}`) : realpathSync(path);
}

function runtimeBotFilesIsInside(roots: string[], path: string) {
  return roots.some((root) => {
    try {
      const actual = realpathSync(root);
      return path === actual || path.startsWith(`${actual}${sep}`);
    } catch {
      return false;
    }
  });
}

function runtimeBotFilesTry<Value>(path: string, work: () => Value): Value {
  try {
    return work();
  } catch (error) {
    return match(error)
      .with({ code: P.union('ELOOP', 'EMLINK', 'ENXIO', 'ENOTDIR', 'EISDIR') }, () => runtimeBotFilesRefuse(path, 'is a link, a folder or a special file'))
      .otherwise(() => {
        throw error;
      });
  }
}

function runtimeBotFilesRefuse(path: string, reason: string): never {
  throw new Errors.FORBIDDEN({ internal: `${path} ${reason}` });
}
