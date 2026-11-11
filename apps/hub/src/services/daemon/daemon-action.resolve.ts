import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import { DAEMON } from './daemon.constants';
import { daemonDriverHealth, daemonDriverPinsWrite } from './daemon.driver';
import type * as DaemonTypes from '../../types/daemon.types';

export async function daemonActionResolve(deps: DaemonTypes.DaemonServiceDeps, { user }: DaemonTypes.DaemonUserParams): Promise<DaemonTypes.DaemonTarget> {
  const { state } = deps;
  const cached = state.checked.get(user.id);

  if (cached && cached.url === user.daemonUrl && Date.now() - cached.checkedAt < DAEMON.healthTtlMs) {
    return { url: cached.url, serverId: cached.serverId };
  }

  const serverId = await daemonDriverHealth(user.daemonUrl);

  if (!serverId) {
    throw new Errors.SERVER_UNREACHABLE({ internal: `The daemon of ${user.id} did not answer /health` });
  }

  const owner = Object.entries(state.pins).find(([id, pinned]) => pinned === serverId && id !== user.id)?.[0];

  if (owner) {
    log.error({
      tag: 'hub',
      message: 'Admin action needed: a daemon answers for two users. Check which daemon belongs to whom before changing users.json or pins.json',
      user: user.id,
      pinnedTo: owner,
      daemonUrl: user.daemonUrl,
      serverId,
    });

    throw new Errors.SERVER_MISMATCH({ internal: `The daemon address of ${user.id} answers as the daemon pinned to ${owner}` });
  }

  await match(state.pins[user.id])
    .with(serverId, () => undefined)
    .with(P.nullish, async () => {
      state.pins = { ...state.pins, [user.id]: serverId };
      const saved = state.saving.then(() => daemonDriverPinsWrite(deps.path, state.pins));
      state.saving = saved.catch(() => undefined);
      await saved;
      log.info({
        tag: 'hub',
        message: 'Daemon server ID pinned',
        user: user.id,
        serverId,
      });
    })
    .otherwise((pinned) => {
      log.error({
        tag: 'hub',
        message: 'Admin action needed: a daemon answers with an unexpected server ID. Confirm which daemon this is before changing pins.json',
        user: user.id,
        daemonUrl: user.daemonUrl,
        pinned,
        serverId,
      });

      throw new Errors.SERVER_MISMATCH({ internal: `The daemon address of ${user.id} answers as ${serverId}, pinned ${pinned}` });
    });

  state.checked.set(user.id, {
    url: user.daemonUrl,
    serverId,
    checkedAt: Date.now(),
  });

  return { url: user.daemonUrl, serverId };
}
