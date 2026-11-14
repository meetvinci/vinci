import { runtimeBotFilesWrite } from '@repo/runtime/native';
import { attachmentStorageAgents, attachmentStoragePath } from './attachment-storage.utils';
import type { AttachmentStorageDeps, AttachmentStorageWriteParams } from '../../types/attachment-storage.types';

export async function attachmentStorageActionWrite(deps: AttachmentStorageDeps, params: AttachmentStorageWriteParams) {
  runtimeBotFilesWrite([await attachmentStorageAgents(deps)], await attachmentStoragePath(deps, params), new Uint8Array(await params.file.arrayBuffer()), {
    mode: 0o600,
    isExclusive: true,
  });
}
