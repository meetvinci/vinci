import { Errors } from '@repo/errors/universal';
import { match, P } from 'ts-pattern';
import { runtimeBotFilesRemove, runtimeBotFilesWrite } from '@repo/runtime/native';
import { attachmentStorageAgents, attachmentStoragePath } from './attachment-storage.utils';
import type { AttachmentStorageDeps, AttachmentStorageWriteParams } from '../../types/attachment-storage.types';

export async function attachmentStorageActionWrite(deps: AttachmentStorageDeps, params: AttachmentStorageWriteParams) {
  const roots = [await attachmentStorageAgents(deps)];
  const path = await attachmentStoragePath(deps, params);
  const bytes = new Uint8Array(await params.file.arrayBuffer());

  try {
    runtimeBotFilesWrite(roots, path, bytes, {
      mode: 0o600,
      isExclusive: true,
    });
  } catch (error) {
    throw match(error)
      .with({ code: P.union('ENOSPC', 'EDQUOT') }, () => {
        try {
          runtimeBotFilesRemove(roots, path);
        } catch {
          // SAFETY: a partial file that cannot be removed only takes room the person's disk had left; the upload fails either way.
        }

        return new Errors.DISK_FULL({ cause: error });
      })
      .otherwise(() => error);
  }
}
