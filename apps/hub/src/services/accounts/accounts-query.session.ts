import { Errors } from '@repo/errors/universal';
import { accountsSessionReply } from '../../types/accounts.types';
import { ACCOUNTS } from './accounts.constants';
import { accountsDriverRequest } from './accounts.driver';
import type { AccessIdentity } from '../../types/access.types';
import type * as AccountsTypes from '../../types/accounts.types';

export function accountsQuerySession(deps: AccountsTypes.AccountsServiceDeps, { token }: AccountsTypes.AccountsSessionParams): Promise<AccessIdentity> {
  const { config, sessions } = deps;

  if (!config) {
    return Promise.reject(new Errors.NOT_FOUND({ internal: 'HUB_ACCOUNTS_URL is not set' }));
  }

  if (!ACCOUNTS.sessionToken.test(token)) {
    return Promise.reject(new Errors.UNAUTHORIZED({ internal: token === '' ? 'No login cookie' : 'Malformed login cookie' }));
  }

  const now = Date.now();
  const cached = sessions.get(token);

  if (cached && cached.until > now) {
    return cached.identity;
  }

  if (sessions.size >= ACCOUNTS.sessionCacheMax) {
    [...sessions].filter(([, entry]) => entry.until <= now).forEach(([key]) => sessions.delete(key));
  }

  if (sessions.size >= ACCOUNTS.sessionCacheMax) {
    sessions.clear();
  }

  const identity = accountsDriverRequest(config, {
    method: 'GET',
    path: ACCOUNTS.sessionPath,
    cookie: `${ACCOUNTS.sessionCookie}=${token}`,
    schema: accountsSessionReply,
  }).then(({ email, expires_at: expiresAt }) => {
    entry.email = email.toLowerCase();

    return { kind: 'session' as const, email: entry.email, token, expiresAt: expiresAt * 1000 };
  });

  const entry: AccountsTypes.AccountsSessionEntry = { until: now + ACCOUNTS.sessionCacheMs, identity, email: null };

  sessions.set(token, entry);
  identity.catch(() => {
    if (sessions.get(token) === entry) {
      sessions.delete(token);
    }
  });

  return identity;
}
