import { getAgentDir, stripFrontmatter } from '@earendil-works/pi-coding-agent';
import { Errors } from '@repo/errors/universal';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { match, P } from 'ts-pattern';
import { runtimeSandboxRead } from '../runtime/runtime-sandbox.utils';
import { skillQueryResolve } from './skill-query.resolve';
import { skillSharedPaths } from './skill.utils';
import type { SkillExpandParams, SkillExpandResult, SkillLoaderServiceDeps } from '../../types/skill.types';
import type { Skill } from '@earendil-works/pi-coding-agent';

export function skillQueryExpand(deps: SkillLoaderServiceDeps, { names, ...params }: SkillExpandParams): SkillExpandResult {
  return match(names)
    .with([], () => ({ prompt: '' }))
    .otherwise((selected) => {
      const catalog = new Map(skillQueryResolve(deps, params).skills.map((skill) => [skill.name, skill]));
      const blocks = [...new Set(selected)].map((name) => skillExpandBlock(catalog.get(name), name));
      return { prompt: blocks.join('\n\n') };
    });

  function skillExpandBlock(skill: Skill | undefined, name: string) {
    return match(skill)
      .with(P.nullish, () => {
        throw new Errors.NOT_FOUND({ resource: 'skill', resourceId: name });
      })
      .otherwise((resolved) => {
        try {
          // SAFETY: a sandboxed bot can swap a listed skill file for a link to the daemon's own files.
          const content = deps.isSandboxed
            ? runtimeSandboxRead(resolved.filePath, [join(deps.root, 'agents'), ...skillSharedPaths(deps.root, getAgentDir(), params.directories)])
            : readFileSync(resolved.filePath, 'utf-8');

          const body = stripFrontmatter(content).trim();
          return `<skill name="${resolved.name}" location="${resolved.filePath}">\nReferences are relative to ${resolved.baseDir}.\n\n${body}\n</skill>`;
        } catch (cause) {
          throw new Errors.NOT_FOUND({
            resource: 'skill',
            resourceId: name,
            cause,
          });
        }
      });
  }
}
