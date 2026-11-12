import { provisionerReply } from '../../types/provisioner.types';
import { provisionerDriverRequest } from './provisioner.driver';
import type * as ProvisionerTypes from '../../types/provisioner.types';

export async function provisionerActionChange(
  deps: ProvisionerTypes.ProvisionerServiceDeps,
  request: ProvisionerTypes.ProvisionerChangeParams,
): Promise<ProvisionerTypes.ProvisionerAccess> {
  try {
    return (await provisionerDriverRequest(deps.config, { ...request, schema: provisionerReply })).access;
  } finally {
    deps.state.access = null;
  }
}
