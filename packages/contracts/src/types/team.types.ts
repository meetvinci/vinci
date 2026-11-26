import { z } from 'zod';
import { adminEmail, adminSectionId, adminSectionMode, adminUserId } from './admin.types';

export const teamWhoami = z.object({
  email: adminEmail,
  name: z.string().nullable(),
  user: adminUserId,
  serverId: z.string().nullable(),
  isAdvanced: z.boolean(),
  isAdmin: z.boolean(),
  hasPassword: z.boolean().default(false),
  sections: z.array(z.object({ id: adminSectionId, mode: adminSectionMode })),
});

export type TeamWhoami = z.infer<typeof teamWhoami>;

export const TEAM_PASSWORD = { min: 12, max: 200 } as const;

export const teamPasswordInput = z.object({
  current: z.string().min(1).max(TEAM_PASSWORD.max),
  password: z.string().min(TEAM_PASSWORD.min, 'validation_password_short').max(TEAM_PASSWORD.max),
});

export const teamPasswordRefusal = z.object({
  error: z.enum(['wrong_password', 'too_many_attempts', 'invalid']),
  retryAfter: z.number().optional(),
});

export type TeamPasswordInput = z.infer<typeof teamPasswordInput>;

export type TeamPasswordRefusal = z.infer<typeof teamPasswordRefusal>;
