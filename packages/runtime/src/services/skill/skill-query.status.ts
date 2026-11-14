import { getAgentDir, loadSkills, parseFrontmatter } from '@earendil-works/pi-coding-agent';
import { match, P } from 'ts-pattern';
import { skillRead, skillSharedPaths } from './skill.utils';
import type { SkillLoaderServiceDeps, SkillStatusParams } from '../../types/skill.types';
import type { SkillSkipReason, SkillStatus } from '@repo/contracts/universal';

export function skillQueryStatus({ root, isSandboxed }: Pick<SkillLoaderServiceDeps, 'root' | 'isSandboxed'>, { directories }: SkillStatusParams): SkillStatus {
  const agentDir = getAgentDir();

  const { skills, diagnostics } = loadSkills({
    cwd: root,
    agentDir,
    includeDefaults: false,
    skillPaths: skillSharedPaths(root, agentDir, directories),
  });

  const loaded = new Set(skills.map((skill) => skill.filePath));
  const skipped = new Map<string, SkillStatus['skipped'][number]>();

  for (const { type, path, message } of diagnostics) {
    if (path !== undefined && !loaded.has(path) && !skipped.has(path)) {
      skipped.set(path, {
        path,
        message: message.split('\n')[0] ?? message,
        reason: type === 'collision' ? 'duplicate' : skillStatusReason(path),
      });
    }
  }

  return { skipped: [...skipped.values()] };

  function skillStatusReason(path: string): SkillSkipReason {
    let content: string;

    try {
      content = skillRead({ root, isSandboxed }, directories, path);
    } catch {
      return 'other';
    }

    try {
      return match(parseFrontmatter(content).frontmatter.description)
        .with(P.string.regex(/\S/u), () => 'other' as const)
        .otherwise(() => 'description' as const);
    } catch {
      return 'frontmatter';
    }
  }
}
