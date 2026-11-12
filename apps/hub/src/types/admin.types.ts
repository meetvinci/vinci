import { z } from 'zod';
import type { ProvisionerService } from '../services/provisioner/provisioner.service';
import type { ProvisionerAccess } from './provisioner.types';

const adminEmail = z.email().transform((email) => email.toLowerCase());

export const adminFile = z.strictObject({ admins: z.array(adminEmail) })
  .refine(({ admins }) => new Set(admins).size === admins.length, { message: 'Each admin email must appear once' })
  .transform(({ admins }) => admins);

export const adminInput = z.strictObject({ email: adminEmail });

export interface AdminServiceParams {
  directory: string;
  seed: string[];
  provisioner: ProvisionerService;
}

export interface AdminServiceDeps {
  path: string;
  provisioner: ProvisionerService;
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

export interface AdminService {
  queries: {
    list: () => Promise<string[]>;
    has: (params: AdminEmailParams) => Promise<boolean>;
  };
  actions: {
    add: (params: AdminChangeParams) => Promise<ProvisionerAccess>;
    remove: (params: AdminChangeParams) => Promise<ProvisionerAccess>;
  };
}
