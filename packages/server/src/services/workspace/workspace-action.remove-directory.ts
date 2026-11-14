import { join } from 'node:path';
import { runtimeBotFilesRemove } from '@repo/runtime/native';
import type { WorkspaceServiceDeps } from '../../types/workspace.types';
import type { BotGetInput } from '@repo/contracts/universal';

export async function workspaceActionRemoveDirectory({ root }: WorkspaceServiceDeps, { botId }: BotGetInput) {
  runtimeBotFilesRemove([join(root, 'agents')], join(root, 'agents', botId));
}
