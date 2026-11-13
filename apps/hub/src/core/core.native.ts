import { env } from '@repo/env/server';
import { Errors, isAppError } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { match, P } from 'ts-pattern';
import { makeAccessService } from '../services/access/access.service';
import { makeAdminService } from '../services/admin/admin.service';
import { makeAuditService } from '../services/audit/audit.service';
import { makeDaemonService } from '../services/daemon/daemon.service';
import { makeGlobalService } from '../services/global/global.service';
import { makePairingService } from '../services/pairing/pairing.service';
import { makeProvisionerService } from '../services/provisioner/provisioner.service';
import { makeUserService } from '../services/user/user.service';
import { coreAuditRecord, coreAuditStatus } from './core-audit.native';
import { coreServer } from './core-server.native';
import type * as CoreTypes from '../types/core.types';

const STOP_SIGNALS = ['SIGINT', 'SIGTERM'] as const;
const START_BY = 'hub start';

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

  const users = await makeUserService({
    directory,
    provisioner,
    daemons,
  });

  const services: CoreTypes.CoreServices = {
    access: makeAccessService(access),
    users,
    daemons,
    global: await makeGlobalService({
      directory,
      users,
      daemons,
    }),
    pairing: makePairingService({ daemons }),
    admins: await makeAdminService({
      directory,
      seed: env.HUB_ADMIN_EMAILS,
      provisioner,
    }),
    provisioner,
    audit: makeAuditService({ directory }),
  };

  const stopped = new Promise<void>((done) => {
    for (const signal of STOP_SIGNALS) {
      process.once(signal, () => done());
    }
  });

  const server = coreServer(services, publicUrl);

  void coreNativeGlobalStart(services);

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
  services.audit.actions.close();
  log.info({ tag: 'hub', message: 'Hub stopped' });
}

async function coreNativeGlobalStart(services: CoreTypes.CoreServices): Promise<void> {
  const status = await services.global.queries.isBroken().then(async (isBroken) => {
    if (isBroken) {
      return 503;
    }

    await services.global.actions.start({ by: START_BY });

    return 200;
  }).catch((error: unknown) => {
    log.error({
      tag: 'hub',
      message: 'The global sync at start failed; Sync now in the admin panel tries again',
      error,
    });

    return coreAuditStatus(isAppError(error) ? error.code : undefined);
  });

  coreAuditRecord(services, {
    by: START_BY,
    kind: 'change',
    action: 'global/sync',
    status,
  });
}
