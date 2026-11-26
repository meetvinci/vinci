import { accountsChangedReply, accountsDeleteReply, accountsPasswordReply, accountsPutReply } from '../../types/accounts.types';
import { accountsActionCall } from './accounts-action.call';
import { accountsQuerySession } from './accounts-query.session';
import { ACCOUNTS } from './accounts.constants';
import { accountsForget, accountsPath } from './accounts.utils';
import type * as AccountsTypes from '../../types/accounts.types';

export function makeAccountsService({ url, token, audit }: AccountsTypes.AccountsServiceParams) {
  const deps: AccountsTypes.AccountsServiceDeps = { config: { url, token }, audit, sessions: new Map() };

  return {
    queries: {
      session: (input: AccountsTypes.AccountsSessionParams) => accountsQuerySession(deps, input),
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
      password: async (target: AccountsTypes.AccountsTarget) => {
        const reply = await accountsActionCall(deps, {
          ...target,
          action: 'accounts/password',
          method: 'POST',
          path: accountsPath({ email: target.email, suffix: '/password' }),
          schema: accountsPasswordReply,
        });

        accountsForget(deps, { email: target.email });

        return reply;
      },
      change: async ({ token: session, current, password, ...target }: AccountsTypes.AccountsChangeParams) => {
        const reply = await accountsActionCall(deps, {
          ...target,
          action: 'accounts/changed',
          method: 'POST',
          path: ACCOUNTS.passwordPath,
          body: { current, password },
          cookie: `${ACCOUNTS.sessionCookie}=${session}`,
          schema: accountsChangedReply,
        });

        accountsForget(deps, { email: target.email, keep: session });

        return reply;
      },
      remove: async (target: AccountsTypes.AccountsTarget) => {
        const reply = await accountsActionCall(deps, {
          ...target,
          action: 'accounts/remove',
          method: 'DELETE',
          path: accountsPath({ email: target.email }),
          schema: accountsDeleteReply,
        });

        accountsForget(deps, { email: target.email });

        return reply;
      },
    },
  };
}

export type AccountsService = ReturnType<typeof makeAccountsService>;
