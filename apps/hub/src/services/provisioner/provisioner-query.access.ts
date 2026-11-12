import { log } from '@repo/logger/server';
import { provisionerAccessRule } from '../../types/provisioner.types';
import { PROVISIONER } from './provisioner.constants';
import { provisionerDriverRequest } from './provisioner.driver';
import type * as ProvisionerTypes from '../../types/provisioner.types';

export function provisionerQueryAccess(deps: ProvisionerTypes.ProvisionerServiceDeps): Promise<ProvisionerTypes.ProvisionerAccessRule> {
  if (!deps.config) {
    return Promise.resolve(PROVISIONER.unknownAccess);
  }

  const cached = deps.state.access;

  if (cached && Date.now() - cached.at < PROVISIONER.accessCacheMs) {
    return cached.rule;
  }

  const rule = provisionerDriverRequest(deps.config, {
    method: 'GET',
    path: '/access',
    schema: provisionerAccessRule,
    timeoutMs: PROVISIONER.accessTimeoutMs,
  }).catch((error: unknown) => {
    log.warn({
      tag: 'hub',
      message: 'The provisioner did not say whom Access allows; showing it as unknown',
      error,
    });

    return PROVISIONER.unknownAccess;
  });

  deps.state.access = { at: Date.now(), rule };

  return rule;
}
