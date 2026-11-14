import { ATTACHMENT } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { match } from 'ts-pattern';
import { runtimeBotFilesRead } from '@repo/runtime/native';
import { ATTACHMENT_STORAGE } from './attachment-storage.constants';
import { attachmentStorageAgents, attachmentStoragePath, attachmentStoragePosterPath } from './attachment-storage.utils';
import type { AttachmentStorageDeps, AttachmentStorageParams } from '../../types/attachment-storage.types';

export async function attachmentStorageQueryPoster(deps: AttachmentStorageDeps, params: AttachmentStorageParams) {
  const poster = attachmentStoragePosterPath(await attachmentStoragePath(deps, params));

  try {
    const bytes = runtimeBotFilesRead([await attachmentStorageAgents(deps)], poster, ATTACHMENT.maxBytes);
    return new File([new Uint8Array(bytes)], ATTACHMENT_STORAGE.posterName, { type: ATTACHMENT_STORAGE.posterMediaType });
  } catch (error) {
    return match(error)
      .with({ code: 'ENOENT' }, () => {
        throw new Errors.NOT_FOUND({ resource: 'attachment' });
      })
      .otherwise(() => {
        throw error;
      });
  }
}
