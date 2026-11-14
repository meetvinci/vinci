import { dirname } from 'node:path';
import { runtimeBotFilesRemove } from '@repo/runtime/native';
import { attachmentStorageAgents, attachmentStoragePath } from './attachment-storage.utils';
import type { AttachmentStorageDeps, AttachmentStorageParams } from '../../types/attachment-storage.types';

export async function attachmentStorageActionRemove(deps: AttachmentStorageDeps, params: AttachmentStorageParams) {
  runtimeBotFilesRemove([await attachmentStorageAgents(deps)], dirname(await attachmentStoragePath(deps, params)));
}
