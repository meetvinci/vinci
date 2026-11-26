import { provisionerRemoved, provisionerUsers } from '../../types/provisioner.types';
import { provisionerActionChange } from './provisioner-action.change';
import { provisionerQueryAccess } from './provisioner-query.access';
import { provisionerDriverRequest } from './provisioner.driver';
import type * as ProvisionerTypes from '../../types/provisioner.types';

export function makeProvisionerService({ url, token }: ProvisionerTypes.ProvisionerServiceParams) {
  const deps: ProvisionerTypes.ProvisionerServiceDeps = { config: url && token ? { url, token } : null, state: { access: null } };

  return {
    queries: {
      isConfigured: () => deps.config !== null,
      list: async () => (await provisionerDriverRequest(deps.config, {
        method: 'GET',
        path: '/users',
        schema: provisionerUsers,
      })).users,
      access: () => provisionerQueryAccess(deps),
    },
    actions: {
      put: ({ user: { id, ...user } }: ProvisionerTypes.ProvisionerPutParams) => provisionerActionChange(deps, {
        method: 'PUT',
        path: `/users/${id}`,
        body: user,
      }),
      remove: ({ id }: ProvisionerTypes.ProvisionerRemoveParams) => provisionerActionChange(deps, {
        method: 'DELETE',
        path: `/users/${id}`,
      }),
      admins: ({ emails }: ProvisionerTypes.ProvisionerAdminsParams) => provisionerActionChange(deps, {
        method: 'PUT',
        path: '/access/admins',
        body: { emails },
      }),
      forgetFirstPassword: () => provisionerDriverRequest(deps.config, {
        method: 'DELETE',
        path: '/admin-password',
        schema: provisionerRemoved,
      }),
    },
  };
}

export type ProvisionerService = ReturnType<typeof makeProvisionerService>;
