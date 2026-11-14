import { log } from '@repo/logger/server';
import { setTimeout as sleep } from 'node:timers/promises';
import { globalActionRetry } from './global-action.retry';
import { globalActionSync } from './global-action.sync';
import { GLOBAL } from './global.constants';
import type * as GlobalTypes from '../../types/global.types';

export async function globalActionStart(deps: GlobalTypes.GlobalServiceDeps, { by, attempts }: GlobalTypes.GlobalStartParams): Promise<void> {
  const users = await globalActionSync(deps, { by }).catch(async (error: unknown) => {
    if (attempts <= 1) {
      throw error;
    }

    log.warn({
      tag: 'hub',
      message: 'The global sync at start could not list people yet; trying again',
      by,
      error,
    });
    await sleep(GLOBAL.startRetryMs, null, { ref: false });

    return null;
  });

  if (users === null) {
    return globalActionStart(deps, { by, attempts: attempts - 1 });
  }

  await Promise.allSettled(users.map(({ id, sections }) => globalActionRetry(deps, {
    id,
    sections: sections.filter(({ sync }) => sync === 'failed').map((section) => section.id),
    by,
    attempts: attempts - 1,
  })));
}
