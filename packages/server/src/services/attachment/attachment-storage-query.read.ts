import { Errors } from '@repo/errors/universal';
import { closeSync, fstatSync } from 'node:fs';
import { match, P } from 'ts-pattern';
import { runtimeBotFilesOpen, runtimeBotFilesReadInto } from '@repo/runtime/native';
import { attachmentStorageAgents, attachmentStoragePath, attachmentStorageRange } from './attachment-storage.utils';
import type { AttachmentStorageDeps, AttachmentStorageReadParams } from '../../types/attachment-storage.types';

export async function attachmentStorageQueryRead(deps: AttachmentStorageDeps, params: AttachmentStorageReadParams) {
  const path = await attachmentStoragePath(deps, params);
  let descriptor: number;

  try {
    descriptor = runtimeBotFilesOpen([await attachmentStorageAgents(deps)], path, params.attachment.size);
  } catch (error) {
    return match(error)
      .with({ code: P.union('ENOENT', 'VALIDATION_ERROR') }, () => {
        throw new Errors.NOT_FOUND({ resource: 'attachment' });
      })
      .otherwise(() => {
        throw error;
      });
  }

  try {
    const { size } = fstatSync(descriptor);

    match(size === params.attachment.size)
      .with(true, () => undefined)
      .with(false, () => {
        throw new Errors.NOT_FOUND({ resource: 'attachment' });
      })
      .exhaustive();

    const range = attachmentStorageRange(params.range, size);

    const [start, length] = match(range)
      .with({ kind: 'partial' }, (part) => [part.start, part.end - part.start + 1])
      .with({ kind: 'unsatisfiable' }, () => [0, 0])
      .with({ kind: 'full' }, () => [0, size])
      .exhaustive();

    const bytes = new Uint8Array(length);

    if (runtimeBotFilesReadInto(descriptor, bytes, start) < length) {
      throw new Errors.NOT_FOUND({ resource: 'file' });
    }

    return {
      file: new File([bytes], params.attachment.name, { type: params.attachment.mediaType }),
      range,
      size,
    };
  } finally {
    closeSync(descriptor);
  }
}
