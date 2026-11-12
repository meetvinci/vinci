import { join } from 'node:path';
import { daemonActionDoor } from './daemon-action.door';
import { daemonActionResolve } from './daemon-action.resolve';
import { DAEMON } from './daemon.constants';
import { daemonDriverPinsRead } from './daemon.driver';
import type * as DaemonTypes from '../../types/daemon.types';

export async function makeDaemonService({ directory }: DaemonTypes.DaemonServiceParams): Promise<DaemonTypes.DaemonService> {
  const path = join(directory, DAEMON.pinsFile);
  const deps: DaemonTypes.DaemonServiceDeps = { path, state: { pins: await daemonDriverPinsRead(path), checked: new Map(), saving: Promise.resolve() } };

  return {
    queries: {
      pinned: () => Object.keys(deps.state.pins),
    },
    actions: {
      resolve: (input) => daemonActionResolve(deps, input),
      door: (input) => daemonActionDoor(deps, input),
      forget: ({ user }) => {
        deps.state.checked.delete(user.id);
      },
    },
  };
}
