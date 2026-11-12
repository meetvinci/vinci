import { log } from '@repo/logger/server';
import { globalActionSync } from './global-action.sync';
import { globalWrittenSection } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';

export function globalActionChanged(deps: GlobalTypes.GlobalServiceDeps, { procedure, by }: GlobalTypes.GlobalChangedParams): void {
  const section = globalWrittenSection(procedure);

  if (!section) {
    return;
  }

  deps.state.dirty.add(section);

  if (deps.state.running.has(section)) {
    return;
  }

  const globalChangedRun = async (): Promise<void> => {
    if (!deps.state.dirty.delete(section)) {
      return;
    }

    await globalActionSync(deps, { section, by }).catch((error: unknown) => log.error({
      tag: 'hub',
      message: 'Copying a global section failed',
      section,
      error,
    }));
    await globalChangedRun();
  };

  deps.state.running.set(section, globalChangedRun().finally(() => deps.state.running.delete(section)));
}
