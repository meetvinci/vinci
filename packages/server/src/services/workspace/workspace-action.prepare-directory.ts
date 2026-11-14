import { Errors } from '@repo/errors/universal';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { match, P } from 'ts-pattern';
import { runtimeBotFilesMakeFolder } from '@repo/runtime/native';
import type { WorkspaceServiceDeps } from '../../types/workspace.types';
import type { BotGetInput } from '@repo/contracts/universal';

export async function workspaceActionPrepareDirectory({ root }: WorkspaceServiceDeps, { botId }: BotGetInput) {
  const directory = join(root, 'agents', botId);

  try {
    // SAFETY: another bot of the person can replace this folder with a link to the daemon's own files.
    runtimeBotFilesMakeFolder([join(root, 'agents')], directory);
  } catch (error) {
    throw match(error)
      .with({ code: P.union('ENOSPC', 'EDQUOT') }, () => new Errors.DISK_FULL({ cause: error }))
      .otherwise(() => error);
  }

  await access(directory, constants.R_OK | constants.W_OK | constants.X_OK);
}
