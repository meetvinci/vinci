import { env } from '@repo/env/server';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { match, P } from 'ts-pattern';
import { makeAccessService } from '../services/access/access.service';
import { makeDaemonService } from '../services/daemon/daemon.service';
import { makePairingService } from '../services/pairing/pairing.service';
import { makeUserService } from '../services/user/user.service';
import { coreServer } from './core-server.native';
import type * as CoreTypes from '../types/core.types';

const STOP_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

export async function coreNativeRun(): Promise<void> {
  const settings = {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    audience: env.ACCESS_AUD,
    publicUrl: env.HUB_PUBLIC_URL,
  };

  const { publicUrl, ...access } = match(settings)
    .with({
      teamDomain: P.string,
      audience: P.string,
      publicUrl: P.instanceOf(URL),
    }, (required) => required)
    .otherwise(() => {
      throw new Errors.INTERNAL_ERROR({ internal: 'ACCESS_TEAM_DOMAIN, ACCESS_AUD and HUB_PUBLIC_URL are required' });
    });

  const directory = resolve(env.HUB_DATA_DIR.replace(/^~(?=\/|$)/u, homedir()));
  const daemons = await makeDaemonService({ directory });

  const services: CoreTypes.CoreServices = {
    access: makeAccessService(access),
    users: await makeUserService({ directory }),
    daemons,
    pairing: makePairingService({ daemons }),
  };

  const stopped = new Promise<void>((done) => {
    for (const signal of STOP_SIGNALS) {
      process.once(signal, () => done());
    }
  });

  const server = coreServer(services, publicUrl);

  log.info({
    tag: 'hub',
    message: 'Hub started',
    host: env.HUB_HOST,
    port: server.port,
    web: env.HUB_WEB_URL,
    publicUrl: publicUrl.origin,
  });

  await stopped;
  await server.stop(true);
  log.info({ tag: 'hub', message: 'Hub stopped' });
}
