import { ATTACHMENT } from '@repo/contracts/universal';
import { closeSync, fstatSync } from 'node:fs';
import { join } from 'node:path';
import { match, P } from 'ts-pattern';
import { runtimeBotFilesList, runtimeBotFilesOpen } from '@repo/runtime/native';
import { attachmentStorageId } from '../../types/attachment-storage.types';
import { ATTACHMENT_STORAGE } from './attachment-storage.constants';
import { attachmentStorageAgents } from './attachment-storage.utils';
import type { AttachmentStorageDeps, AttachmentStorageTarget } from '../../types/attachment-storage.types';
import type { Attachment } from '@repo/contracts/universal';

export async function attachmentStorageQueryStale(deps: AttachmentStorageDeps, params: AttachmentStorageTarget): Promise<Attachment[]> {
  const agents = await attachmentStorageAgents(deps);
  const directory = join(agents, params.botId, '.attachments', String(params.conversationId));

  try {
    const ids = runtimeBotFilesList([agents], directory).filter((entry) => entry.isDirectory() && attachmentStorageId.safeParse(entry.name).success);

    return ids.flatMap(({ name: id }) => runtimeBotFilesList([agents], join(directory, id))
      .filter((child) => child.isFile() && child.name !== ATTACHMENT_STORAGE.posterName)
      .flatMap(({ name }) => match(attachmentStorageStaleInfo(join(directory, id, name)))
        .with({ mtimeMs: P.number.lte(Date.now() - ATTACHMENT.pendingTtlMs) }, ({ size, mtimeMs }) => [{ id, name, mediaType: 'application/octet-stream', size, createdAt: mtimeMs, isRetained: false }])
        .otherwise(() => [])));
  } catch (error) {
    return match(error)
      .with({ code: 'ENOENT' }, () => [])
      .otherwise(() => {
        throw error;
      });
  }

  function attachmentStorageStaleInfo(path: string) {
    try {
      const descriptor = runtimeBotFilesOpen([agents], path, Number.MAX_SAFE_INTEGER);

      try {
        return fstatSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    } catch {
      return undefined;
    }
  }
}
