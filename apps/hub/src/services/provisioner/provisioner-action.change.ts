import { provisionerReply } from '../../types/provisioner.types';
import { provisionerDriverRequest } from './provisioner.driver';
import type * as ProvisionerTypes from '../../types/provisioner.types';

export async function provisionerActionChange(deps: ProvisionerTypes.ProvisionerServiceDeps, request: ProvisionerTypes.ProvisionerChangeParams): Promise<void> {
  await provisionerDriverRequest(deps.config, { ...request, schema: provisionerReply });
}
