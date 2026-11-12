import { provisionerReply, provisionerUsers } from '../../types/provisioner.types';
import { provisionerDriverRequest } from './provisioner.driver';
import type * as ProvisionerTypes from '../../types/provisioner.types';

export function makeProvisionerService({ url, token }: ProvisionerTypes.ProvisionerServiceParams) {
  const deps: ProvisionerTypes.ProvisionerServiceDeps = { config: url && token ? { url, token } : null };

  return {
    queries: {
      isConfigured: () => deps.config !== null,
      list: async () => (await provisionerDriverRequest(deps.config, {
        method: 'GET',
        path: '/users',
        schema: provisionerUsers,
      })).users,
    },
    actions: {
      put: async ({ user: { id, ...user } }: ProvisionerTypes.ProvisionerPutParams) => (await provisionerDriverRequest(deps.config, {
        method: 'PUT',
        path: `/users/${id}`,
        body: user,
        schema: provisionerReply,
      })).access,
      remove: async ({ id }: ProvisionerTypes.ProvisionerRemoveParams) => (await provisionerDriverRequest(deps.config, {
        method: 'DELETE',
        path: `/users/${id}`,
        schema: provisionerReply,
      })).access,
      admins: async ({ emails }: ProvisionerTypes.ProvisionerAdminsParams) => (await provisionerDriverRequest(deps.config, {
        method: 'PUT',
        path: '/access/admins',
        body: { emails },
        schema: provisionerReply,
      })).access,
    },
  };
}

export type ProvisionerService = ReturnType<typeof makeProvisionerService>;
