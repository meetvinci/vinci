import { z } from 'zod';

export const adminEmail = z.email().max(254);
export const adminUserId = z.string().regex(/^[a-z\d][a-z\d-]{0,62}$/u);
export const adminAccess = z.enum(['synced', 'manual']);
export const adminUserState = z.enum(['running', 'starting', 'stopped', 'unknown']);

export const adminMe = z.object({ email: adminEmail });

export const admin = z.object({ email: adminEmail });
export const adminList = z.object({ admins: z.array(admin) });

export const adminUser = z.object({
  id: adminUserId,
  name: z.string(),
  email: adminEmail,
  enabled: z.boolean(),
  state: adminUserState,
});

export const adminUserList = z.object({ users: z.array(adminUser) });
export const adminUserCreate = z.object({ name: z.string().trim().min(1).max(80), email: adminEmail });

export const adminChangeResult = z.object({ access: adminAccess.optional() });
export const adminUserCreateResult = adminUser.extend(adminChangeResult.shape);

export const adminUserPatch = z.object({
  id: adminUserId,
  name: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
});

export type Admin = z.infer<typeof admin>;
export type AdminAccess = z.infer<typeof adminAccess>;
export type AdminUser = z.infer<typeof adminUser>;
export type AdminUserCreate = z.infer<typeof adminUserCreate>;
export type AdminUserState = z.infer<typeof adminUserState>;
export type AdminUserPatch = z.infer<typeof adminUserPatch>;
