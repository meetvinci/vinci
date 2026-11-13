import { log } from '@repo/logger/server';
import { setTimeout as sleep } from 'node:timers/promises';
import { globalActionApply } from './global-action.apply';
import { globalActionSync } from './global-action.sync';
import { GLOBAL } from './global.constants';
import { globalSectionState } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';

export async function globalActionStart(deps: GlobalTypes.GlobalServiceDeps, { by, attempts }: GlobalTypes.GlobalStartParams): Promise<void> {
  const globalRetry = async ({ id, sections, attempts: left }: GlobalTypes.GlobalStartRetryParams): Promise<void> => {
    if (sections.length === 0 || left < 1) {
      return;
    }

    await sleep(GLOBAL.startRetryMs, null, { ref: false });
    await globalActionApply(deps, {
      id,
      sections,
      by,
    });

    return globalRetry({
      id,
      sections: sections.filter((section) => globalSectionState(deps.state.file, id, section).sync === 'failed'),
      attempts: left - 1,
    });
  };

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

  await Promise.allSettled(users.map(({ id, sections }) => globalRetry({
    id,
    sections: sections.filter(({ sync }) => sync === 'failed').map((section) => section.id),
    attempts: attempts - 1,
  })));
}
