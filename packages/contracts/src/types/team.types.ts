import { z } from 'zod';
import { adminEmail, adminSectionId, adminSectionMode, adminUserId } from './admin.types';

export const teamWhoami = z.object({
  email: adminEmail,
  user: adminUserId,
  serverId: z.string().nullable(),
  isAdvanced: z.boolean(),
  sections: z.array(z.object({ id: adminSectionId, mode: adminSectionMode })),
});

export type TeamWhoami = z.infer<typeof teamWhoami>;
