import { conversationTarget } from '@repo/contracts/universal';
import { z } from 'zod';
import type { AccountsService } from '../services/accounts/accounts.service';
import type { ProvisionerService } from '../services/provisioner/provisioner.service';
import type { AccountsPut } from './accounts.types';

const adminEmail = z.email().transform((email) => email.toLowerCase());

export const adminFile = z.strictObject({ admins: z.array(adminEmail) })
  .refine(({ admins }) => new Set(admins).size === admins.length, { message: 'Each admin email must appear once' })
  .transform(({ admins }) => admins);

export const adminInput = z.strictObject({ email: adminEmail });

const adminReadJson = z.string().min(1).max(64 * 1024).transform((text, context) => {
  try {
    return z.json().parse(JSON.parse(text));
  } catch {
    context.addIssue({ code: 'custom', message: 'validation_invalid' });

    return z.NEVER;
  }
});

export const adminReadBody = adminReadJson.pipe(z.object({ json: conversationTarget }));

export const adminWriteBody = adminReadJson.pipe(z.object({ json: z.object({ botId: z.uuid() }) }));

export const adminEmptyReply = adminReadJson.pipe(z.object({ json: z.array(z.json()).length(0) }));

export const adminListBody = z.union([z.literal(''), adminReadJson.pipe(z.object({ json: z.union([z.null(), z.strictObject({})]).optional() }))]);

export interface AdminServiceParams {
  directory: string;
  seed: string[];
  provisioner: ProvisionerService;
  accounts: AccountsService;
}

export interface AdminServiceDeps {
  path: string;
  provisioner: ProvisionerService;
  accounts: AccountsService;
  state: AdminState;
}

export interface AdminState {
  admins: string[];
  isBroken: boolean;
  mtimeMs: number | null | undefined;
  checkedAt: number;
  saving: Promise<void>;
}

export interface AdminEmailParams {
  email: string;
}

export interface AdminChangeParams extends AdminEmailParams {
  by: string;
}

export interface AdminSyncParams extends Pick<AdminChangeParams, 'by'> {
  attempts: number;
}

export interface AdminChangeKindParams extends AdminChangeParams {
  isAdding: boolean;
}

export interface AdminChanged {
  password?: string;
}

export interface AdminAccountUndoParams extends AdminChangeParams {
  account: AccountsPut | null;
}

export interface AdminService {
  queries: {
    list: () => Promise<string[]>;
    has: (params: AdminEmailParams) => Promise<boolean>;
  };
  actions: {
    add: (params: AdminChangeParams) => Promise<AdminChanged>;
    remove: (params: AdminChangeParams) => Promise<AdminChanged>;
  };
}
