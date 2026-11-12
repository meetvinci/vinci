import { Errors } from '@repo/errors/universal';
import { match } from 'ts-pattern';
import { PROVISIONER } from './provisioner.constants';
import type * as ProvisionerTypes from '../../types/provisioner.types';
import type { z } from 'zod';

export async function provisionerDriverRequest<T extends z.ZodType>(
  config: ProvisionerTypes.ProvisionerConfig | null,
  { method, path, body, schema, timeoutMs }: ProvisionerTypes.ProvisionerRequest<T>,
): Promise<z.output<T>> {
  if (!config) {
    throw new Errors.INTERNAL_ERROR({ internal: 'PROVISIONER_URL is not set' });
  }

  const response = await fetch(new URL(path, config.url), {
    method,
    headers: { 'authorization': `Bearer ${config.token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs ?? (method === 'GET' ? PROVISIONER.readTimeoutMs : PROVISIONER.writeTimeoutMs)),
  }).catch((error: unknown) => {
    throw new Errors.SERVER_UNREACHABLE({ internal: `The provisioner did not answer ${method} ${path}`, cause: error });
  });

  return match(response.status)
    .when(() => response.ok, async () => schema.parse(await response.json()))
    .with(404, () => {
      throw new Errors.NOT_FOUND({ internal: `The provisioner has no ${path}` });
    })
    .with(409, () => {
      throw new Errors.CONFLICT({ internal: `The provisioner refused ${method} ${path} as a conflict` });
    })
    .otherwise(async (status) => {
      throw new Errors.SERVER_UNREACHABLE({ internal: `The provisioner answered ${status} to ${method} ${path}: ${await response.text().catch(() => '')}` });
    });
}
