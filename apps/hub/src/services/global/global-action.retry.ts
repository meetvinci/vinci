import { setTimeout as sleep } from 'node:timers/promises';
import { globalActionApply } from './global-action.apply';
import { GLOBAL } from './global.constants';
import { globalSectionState } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';

export async function globalActionRetry(deps: GlobalTypes.GlobalServiceDeps, { id, sections, by, attempts }: GlobalTypes.GlobalRetryParams): Promise<void> {
  if (sections.length === 0 || attempts < 1) {
    return;
  }

  await sleep(GLOBAL.startRetryMs, null, { ref: false });
  await globalActionApply(deps, {
    id,
    sections,
    by,
  });

  return globalActionRetry(deps, {
    id,
    sections: sections.filter((section) => globalSectionState(deps.state.file, id, section).sync === 'failed'),
    by,
    attempts: attempts - 1,
  });
}
