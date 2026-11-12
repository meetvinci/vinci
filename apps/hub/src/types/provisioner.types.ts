import { z } from 'zod';
import { userId } from './user.types';

const provisionerAccess = z.enum(['synced', 'manual']);

const provisionerUser = z.object({
  id: userId,
  name: z.string(),
  email: z.email().transform((email) => email.toLowerCase()),
  enabled: z.boolean(),
  state: z.enum(['running', 'starting', 'stopped', 'unknown']),
});

export const provisionerUsers = z.object({ users: z.array(provisionerUser) });

export const provisionerReply = z.looseObject({ access: provisionerAccess });

export type ProvisionerAccess = z.infer<typeof provisionerAccess>;

export type ProvisionerUser = z.infer<typeof provisionerUser>;

export interface ProvisionerServiceParams {
  url: string | undefined;
  token: string | undefined;
}

export interface ProvisionerConfig {
  url: string;
  token: string;
}

export interface ProvisionerServiceDeps {
  config: ProvisionerConfig | null;
}

export interface ProvisionerPutParams {
  user: Omit<ProvisionerUser, 'state'>;
}

export interface ProvisionerRemoveParams {
  id: string;
}

export interface ProvisionerAdminsParams {
  emails: string[];
}

export interface ProvisionerRequest<T extends z.ZodType> {
  method: 'GET' | 'PUT' | 'DELETE';
  path: string;
  body?: object;
  schema: T;
}
