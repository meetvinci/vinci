import { z } from 'zod';

export const skillSettings = z.object({
  directories: z.array(z.string().trim().min(1).max(4096)).max(50),
});

export const skillConfigure = skillSettings.partial();

export const skillDiscover = z.object({ botId: z.uuid() });

export const skill = z.object({
  name: z.string(),
  description: z.string(),
  filePath: z.string(),
  isModelInvocable: z.boolean(),
  argumentsSchema: z.record(z.string(), z.json()),
  argumentHint: z.string().nullable(),
  isShared: z.boolean(),
});

export const skillCatalog = z.array(skill);

export const skillSkipReason = z.enum(['frontmatter', 'description', 'duplicate', 'other']);

export const skillStatus = z.object({
  skipped: z.array(z.object({
    path: z.string(),
    reason: skillSkipReason,
    message: z.string(),
  })),
});

export type SkillSettings = z.infer<typeof skillSettings>;
export type SkillConfigureInput = z.infer<typeof skillConfigure>;
export type Skill = z.infer<typeof skill>;
export type SkillSkipReason = z.infer<typeof skillSkipReason>;
export type SkillStatus = z.infer<typeof skillStatus>;
