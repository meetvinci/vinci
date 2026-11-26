import { Errors } from '@repo/errors/universal';
import { ACCOUNTS } from './accounts.constants';
import type * as AccountsTypes from '../../types/accounts.types';
import type { z } from 'zod';

export async function accountsDriverRequest<T extends z.ZodType>(
  config: AccountsTypes.AccountsConfig,
  { method, path, body, schema }: AccountsTypes.AccountsRequest<T>,
): Promise<z.output<T>> {
  const response = await fetch(new URL(path, config.url), {
    method,
    headers: { 'authorization': `Bearer ${config.token}`, 'accept': 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(ACCOUNTS.timeoutMs),
  }).catch((error: unknown) => {
    throw new Errors.ACCOUNTS_UNAVAILABLE({ internal: `The accounts service did not answer ${method} ${path}`, cause: error });
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Errors.ACCOUNTS_UNAVAILABLE({ internal: `The accounts service answered ${response.status} to ${method} ${path}` });
  }

  const parsed = schema.safeParse(await response.json().catch(() => null));

  if (!parsed.success) {
    throw new Errors.ACCOUNTS_UNAVAILABLE({ internal: `The accounts service sent an unexpected reply to ${method} ${path}` });
  }

  return parsed.data;
}
