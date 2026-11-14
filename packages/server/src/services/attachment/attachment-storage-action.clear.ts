import { join } from 'node:path';
import { runtimeBotFilesRemove } from '@repo/runtime/native';
import { attachmentStorageAgents } from './attachment-storage.utils';
import type { AttachmentStorageDeps } from '../../types/attachment-storage.types';
import type { BotGetInput } from '@repo/contracts/universal';

export async function attachmentStorageActionClear(deps: AttachmentStorageDeps, { botId }: BotGetInput) {
  const agents = await attachmentStorageAgents(deps);
  runtimeBotFilesRemove([agents], join(agents, botId, '.attachments'));
}
