import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { match } from 'ts-pattern';
import { RUNTIME_BOT_FILES } from '../runtime/runtime-bot-files.constants';
import { runtimeBotFilesList, runtimeBotFilesRead } from '../runtime/runtime-bot-files.utils';
import type { SkillLoaderServiceDeps } from '../../types/skill.types';

export function skillSharedPaths(root: string, agentDir: string, directories: string[]): string[] {
  return [...directories.map((path) => resolve(root, match(path)
    .with('~', () => homedir())
    .when((value) => value.startsWith('~/'), (value) => join(homedir(), value.slice(2)))
    .otherwise((value) => value))), join(agentDir, 'skills')].filter(existsSync);
}

// SAFETY: a sandboxed bot can swap a listed skill file for a link to the daemon's own files, a FIFO or a huge file.
export function skillRead({ root, isSandboxed }: Pick<SkillLoaderServiceDeps, 'root' | 'isSandboxed'>, directories: string[], path: string): string {
  return match(isSandboxed)
    .with(true, () => runtimeBotFilesRead([join(root, 'agents'), ...skillSharedPaths(root, getAgentDir(), directories)], path, RUNTIME_BOT_FILES.textMaxBytes).toString('utf8'))
    .with(false, () => readFileSync(path, 'utf-8'))
    .exhaustive();
}

// SAFETY: found like Pi's loadSkills walk, but through runtimeBotFiles; links and special files are left out (api.md).
export function skillBotFiles(root: string, directory: string, isTop = true): string[] {
  const entries = runtimeBotFilesList([join(root, 'agents')], directory);
  const skill = entries.find((entry) => entry.name === 'SKILL.md' && entry.isFile());

  return match(skill)
    .with(undefined, () => entries.filter((entry) => !entry.name.startsWith('.')).flatMap((entry) => match(entry)
      .when((item) => item.isDirectory() && item.name !== 'node_modules', (item) => skillBotFiles(root, join(directory, item.name), false))
      .when((item) => isTop && item.isFile() && item.name.endsWith('.md'), (item) => [join(directory, item.name)])
      .otherwise(() => [])))
    .otherwise(() => [join(directory, 'SKILL.md')]);
}
