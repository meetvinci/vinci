import { adminTemplateId } from '@repo/contracts/universal';
import { z } from 'zod';
import type { AccountsService } from '../services/accounts/accounts.service';
import type { ProvisionerService } from '../services/provisioner/provisioner.service';
import type { AccountsPut } from './accounts.types';
import type { AdminService } from './admin.types';
import type { DaemonService } from './daemon.types';
import type { ProvisionerUser } from './provisioner.types';

export const userId = z.string().regex(/^[a-z\d][a-z\d-]{0,62}$/u);

const userDaemon = z.strictObject({
  daemonUrl: z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin),
  socketPath: z.string().startsWith('/'),
});

const userEntry = userDaemon.extend({
  id: userId.refine((id) => id !== adminTemplateId, { message: 'The id template is reserved for the template workspace' }),
  name: z.string().optional(),
  advanced: z.literal(true).optional(),
});

export const userFile = z.strictObject({ users: z.record(z.email(), userEntry), template: userDaemon.optional() }).transform(({ users, template }, context) => {
  const entries = Object.entries(users).map(([email, entry]) => ({ ...entry, email: email.toLowerCase() }));
  const daemons = [...entries, ...(template ? [template] : [])];
  const fields = ['email', 'id'] as const;
  const addresses = ['daemonUrl', 'socketPath'] as const;

  if (fields.some((field) => new Set(entries.map((entry) => entry[field])).size !== entries.length)
    || addresses.some((field) => new Set(daemons.map((entry) => entry[field])).size !== daemons.length)) {
    context.addIssue({ code: 'custom', message: 'Each email, user id, daemonUrl and socketPath must appear once' });
    return z.NEVER;
  }

  return { users: new Map(entries.map((user) => [user.email, user])), template: template ? { ...template, id: adminTemplateId } : null };
});

const userName = z.string().trim().min(1).max(80).regex(/^\P{Cc}+$/u);

export const userCreateInput = z.strictObject({
  name: userName,
  email: z.email().transform((email) => email.toLowerCase()),
  bots: z.array(z.uuid()).max(50).optional(),
});

export const userUpdateInput = z.strictObject({
  name: userName.optional(),
  enabled: z.boolean().optional(),
  advanced: z.boolean().optional(),
});

export type User = z.infer<typeof userEntry> & { email: string };

export type UserDaemon = Pick<User, 'id' | 'daemonUrl' | 'socketPath'>;

export interface UserServiceParams {
  directory: string;
  provisioner: ProvisionerService;
  daemons: DaemonService;
  accounts: AccountsService;
  admins: AdminService;
}

export interface UserServiceDeps extends Omit<UserServiceParams, 'directory'> {
  path: string;
  state: UserState;
}

export interface UserState {
  users: Map<string, User>;
  template: UserDaemon | null;
  mtimeMs: number | null | undefined;
  checkedAt: number;
  creating: Promise<void>;
}

export interface UserFindParams {
  email: string;
}

export interface UserGetParams {
  id: string;
}

export interface UserCreateParams extends z.infer<typeof userCreateInput> {
  by: string;
}

export interface UserUpdateParams extends z.infer<typeof userUpdateInput> {
  id: string;
  by: string;
}

export interface UserRemoveParams {
  id: string;
  by: string;
}

export type UserPasswordParams = UserRemoveParams;

export interface UserAccountParams {
  email: string;
  name: string;
  userId: string;
  by: string;
}

export interface UserAccountUndoParams extends Omit<UserAccountParams, 'name'> {
  account: AccountsPut | null;
}

export interface UserChanged extends ProvisionerUser {
  password?: string;
}

export interface UserPassword {
  password: string;
}

export interface UserRemoved {
  removed: true;
}

export interface UserService {
  queries: {
    find: (params: UserFindParams) => Promise<User | null>;
    get: (params: UserGetParams) => Promise<User | null>;
    template: () => Promise<UserDaemon | null>;
    list: () => Promise<ProvisionerUser[]>;
  };
  actions: {
    create: (params: Omit<UserCreateParams, 'bots'>) => Promise<UserChanged>;
    update: (params: UserUpdateParams) => Promise<UserChanged>;
    remove: (params: UserRemoveParams) => Promise<UserRemoved>;
    password: (params: UserPasswordParams) => Promise<UserPassword>;
    reload: () => Promise<void>;
  };
}
