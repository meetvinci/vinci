import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { ATTACHMENT } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { closeSync, fstatSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { match, P } from 'ts-pattern';
import { runtimeBotFilesOpen, runtimeBotFilesReadInto } from '@repo/runtime/native';
import { attachmentName } from './attachment.utils';
import type { AttachmentStorageDeps } from '../../types/attachment-storage.types';
import type { AttachmentSendParams } from '../../types/attachment.types';

// SAFETY: a sandboxed bot sends only what its sandbox sees, checked on the open file; unsandboxed bots run in the daemon.
export async function attachmentStorageQuerySource({ root, isSandboxed }: AttachmentStorageDeps, params: AttachmentSendParams) {
  const base = await realpath(root);
  const path = resolve(base, 'agents', params.botId, params.path);
  const mediaType = Object.entries(ATTACHMENT.sendTypes).find(([extension]) => `.${extension}` === extname(path).toLowerCase())?.[1];

  const type = match(mediaType)
    .with(P.string, (value) => value)
    .otherwise(() => {
      throw new Errors.VALIDATION_ERROR({ fields: { path: { message: 'validation_file_type' } } });
    });

  const roots = await match(isSandboxed)
    .with(true, async () => [join(base, 'agents'), join(homedir(), '.agents')])
    .with(false, async () => {
      await attachmentStorageSourceAssertOwn();
      return [sep];
    })
    .exhaustive();

  const descriptor = attachmentStorageSourceOpen(roots);

  try {
    const { size } = fstatSync(descriptor);

    match(size)
      .with(0, () => {
        throw new Errors.VALIDATION_ERROR({ fields: { path: { message: 'validation_file_size' } } });
      })
      .otherwise(() => undefined);

    const bytes = new Uint8Array(size);

    if (runtimeBotFilesReadInto(descriptor, bytes, 0) < size) {
      throw new Errors.NOT_FOUND({ resource: 'file' });
    }

    return new File([bytes], attachmentName(basename(path)), { type });
  } finally {
    closeSync(descriptor);
  }

  function attachmentStorageSourceOpen(allowed: string[]) {
    try {
      return runtimeBotFilesOpen(allowed, path, ATTACHMENT.sendMaxBytes);
    } catch (error) {
      return match(error)
        .with({ code: P.union('ENOENT', 'ENOTDIR') }, () => {
          throw new Errors.NOT_FOUND({ resource: 'file' });
        })
        .otherwise(() => {
          throw error;
        });
    }
  }

  async function attachmentStorageSourceAssertOwn() {
    const actual = await realpath(path).catch((error: unknown) => match(error)
      .with({ code: P.union('ENOENT', 'ENOTDIR') }, () => {
        throw new Errors.NOT_FOUND({ resource: 'file' });
      })
      .otherwise(() => {
        throw error;
      }));

    const protectedPaths = await Promise.all([resolve(base, 'data'), getAgentDir()].map((item) => realpath(item).catch(() => resolve(item))));

    const isProtected = protectedPaths.some((item) => {
      const inner = relative(item, actual);
      return !isAbsolute(inner) && inner.split(sep)[0] !== '..';
    });

    match(isProtected)
      .with(true, () => {
        throw new Errors.FORBIDDEN();
      })
      .with(false, () => undefined)
      .exhaustive();
  }
}
