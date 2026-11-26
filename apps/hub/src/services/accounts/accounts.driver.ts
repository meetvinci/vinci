import { Errors } from '@repo/errors/universal';
import { match } from 'ts-pattern';
import { accountsRefusal } from '../../types/accounts.types';
import { ACCOUNTS } from './accounts.constants';
import type * as AccountsTypes from '../../types/accounts.types';
import type { z } from 'zod';

export async function accountsDriverRequest<T extends z.ZodType>(
  config: AccountsTypes.AccountsConfig,
  { method, path, body, cookie, schema }: AccountsTypes.AccountsRequest<T>,
): Promise<z.output<T>> {
  const headers = new Headers({
    'authorization': `Bearer ${config.token}`,
    'accept': 'application/json',
    'content-type': 'application/json',
  });

  if (cookie !== undefined) {
    headers.set('cookie', cookie);
  }

  const response = await fetch(new URL(path, config.url), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(ACCOUNTS.timeoutMs),
  }).catch((error: unknown) => {
    throw new Errors.ACCOUNTS_UNAVAILABLE({ internal: `The accounts service did not answer ${method} ${path}`, cause: error });
  });

  if (!response.ok) {
    const refusal = accountsRefusal.safeParse(await response.json().catch(() => null)).data;
    const internal = `The accounts service answered ${response.status} to ${method} ${path}`;

    throw match(response.status)
      .with(401, () => new Errors.UNAUTHORIZED({ internal }))
      .with(403, () => new Errors.FORBIDDEN({ internal }))
      .with(422, () => new Errors.VALIDATION_ERROR({ internal, fields: {} }))
      .with(429, () => new Errors.RATE_LIMITED({ internal, retryAfter: refusal?.seconds ?? 60 }))
      .otherwise(() => new Errors.ACCOUNTS_UNAVAILABLE({ internal }));
  }

  const parsed = schema.safeParse(await response.json().catch(() => null));

  if (!parsed.success) {
    throw new Errors.ACCOUNTS_UNAVAILABLE({ internal: `The accounts service sent an unexpected reply to ${method} ${path}` });
  }

  return parsed.data;
}
