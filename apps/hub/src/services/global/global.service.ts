import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { globalActionBots } from './global-action.bots';
import { globalActionChanged } from './global-action.changed';
import { globalActionCreate } from './global-action.create';
import { globalActionMode } from './global-action.mode';
import { globalActionReload } from './global-action.reload';
import { globalActionSync } from './global-action.sync';
import { globalActionUpdate } from './global-action.update';
import { globalQueryGlobal } from './global-query.global';
import { globalQueryPreview } from './global-query.preview';
import { globalQueryStatus } from './global-query.status';
import { GLOBAL } from './global.constants';
import { globalSections, globalSectionState, globalWrittenSection } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';

export async function makeGlobalService({ directory, ...services }: GlobalTypes.GlobalServiceParams): Promise<GlobalTypes.GlobalService> {
  const deps: GlobalTypes.GlobalServiceDeps = {
    ...services,
    path: join(directory, GLOBAL.file),
    state: {
      file: { users: {} },
      isBroken: false,
      mtimeMs: undefined,
      saving: Promise.resolve(),
      pending: 0,
      queues: new Map(),
      running: new Map(),
      dirty: new Set(),
      previewKey: randomBytes(32),
    },
  };

  await globalActionReload(deps);

  return {
    queries: {
      global: () => globalQueryGlobal(deps),
      isBroken: async () => {
        await globalActionReload(deps);

        return deps.state.isBroken;
      },
      sections: ({ id }) => globalSections(deps.state.file, id),
      status: () => globalQueryStatus(deps),
      preview: (params) => globalQueryPreview(deps, params),
      section: ({ procedure }) => globalWrittenSection(procedure),
      guard: ({ id, procedure }) => {
        const section = GLOBAL.ownWrites.includes(procedure.toLowerCase()) ? null : globalWrittenSection(procedure);

        return section && globalSectionState(deps.state.file, id, section).mode === 'global' ? section : null;
      },
    },
    actions: {
      mode: (params) => globalActionMode(deps, params),
      sync: (params) => globalActionSync(deps, params),
      changed: (params) => globalActionChanged(deps, params),
      create: (params) => globalActionCreate(deps, params),
      update: (params) => globalActionUpdate(deps, params),
      bots: (params) => globalActionBots(deps, params),
    },
  };
}
