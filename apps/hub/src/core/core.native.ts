import { env } from '@repo/env/server';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { match, P } from 'ts-pattern';
import { makeAccessService } from '../services/access/access.service';
import { makeAdminService } from '../services/admin/admin.service';
import { makeDaemonService } from '../services/daemon/daemon.service';
import { makePairingService } from '../services/pairing/pairing.service';
import { makeProvisionerService } from '../services/provisioner/provisioner.service';
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

  if (env.PROVISIONER_URL && !env.PROVISIONER_TOKEN) {
    throw new Errors.INTERNAL_ERROR({ internal: 'PROVISIONER_TOKEN is required with PROVISIONER_URL' });
  }

  const directory = resolve(env.HUB_DATA_DIR.replace(/^~(?=\/|$)/u, homedir()));
  const daemons = await makeDaemonService({ directory });
  const provisioner = makeProvisionerService({ url: env.PROVISIONER_URL, token: env.PROVISIONER_TOKEN });

  const services: CoreTypes.CoreServices = {
    access: makeAccessService(access),
    users: await makeUserService({
      directory,
      provisioner,
      daemons,
    }),
    daemons,
    pairing: makePairingService({ daemons }),
    admins: await makeAdminService({
      directory,
      seed: env.HUB_ADMIN_EMAILS,
      provisioner,
    }),
    provisioner,
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
    provisioner: env.PROVISIONER_URL ?? null,
    publicUrl: publicUrl.origin,
  });

  await stopped;
  await server.stop(true);
  log.info({ tag: 'hub', message: 'Hub stopped' });
}
