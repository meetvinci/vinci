import { accountsDeleteReply, accountsPasswordReply, accountsPutReply } from '../../types/accounts.types';
import { accountsActionCall } from './accounts-action.call';
import { accountsPath } from './accounts.utils';
import type * as AccountsTypes from '../../types/accounts.types';

export function makeAccountsService({ url, token, audit }: AccountsTypes.AccountsServiceParams) {
  const deps: AccountsTypes.AccountsServiceDeps = { config: url && token ? { url, token } : null, audit };

  return {
    queries: {
      isConfigured: () => deps.config !== null,
    },
    actions: {
      put: ({ name, ...target }: AccountsTypes.AccountsPutParams) => accountsActionCall(deps, {
        ...target,
        action: 'accounts/put',
        method: 'PUT',
        path: accountsPath({ email: target.email }),
        body: { name },
        schema: accountsPutReply,
      }),
      password: (target: AccountsTypes.AccountsTarget) => accountsActionCall(deps, {
        ...target,
        action: 'accounts/password',
        method: 'POST',
        path: accountsPath({ email: target.email, suffix: '/password' }),
        schema: accountsPasswordReply,
      }),
      remove: (target: AccountsTypes.AccountsTarget) => accountsActionCall(deps, {
        ...target,
        action: 'accounts/remove',
        method: 'DELETE',
        path: accountsPath({ email: target.email }),
        schema: accountsDeleteReply,
      }),
    },
  };
}

export type AccountsService = ReturnType<typeof makeAccountsService>;
