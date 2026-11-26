import { Errors } from '@repo/errors/universal';
import { accountsDriverRequest } from './accounts.driver';
import { accountsRecord } from './accounts.utils';
import type * as AccountsTypes from '../../types/accounts.types';
import type { z } from 'zod';

export async function accountsActionCall<T extends z.ZodType>(
  deps: AccountsTypes.AccountsServiceDeps,
  { action, email, userId, by, ...request }: AccountsTypes.AccountsCallParams<T>,
): Promise<z.output<T>> {
  if (!deps.config) {
    throw new Errors.NOT_FOUND({ internal: 'HUB_ACCOUNTS_URL is not set' });
  }

  const target = {
    action,
    email,
    userId,
    by,
  };

  try {
    const reply = await accountsDriverRequest(deps.config, request);

    accountsRecord(deps, { ...target, status: 200 });

    return reply;
  } catch (error) {
    accountsRecord(deps, { ...target, status: 502 });

    throw error;
  }
}
