import { getAgentDir, loadSkills, parseFrontmatter } from '@earendil-works/pi-coding-agent';
import { log } from '@repo/logger/server';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { match, P } from 'ts-pattern';
import { RUNTIME_BOT_FILES } from '../runtime/runtime-bot-files.constants';
import { runtimeBotFilesRead } from '../runtime/runtime-bot-files.utils';
import { skillBotFiles, skillRead, skillSharedPaths } from './skill.utils';
import type { SkillLoaderServiceDeps, SkillLoadParams, SkillResolvedResult } from '../../types/skill.types';

export function skillQueryResolve(deps: SkillLoaderServiceDeps, params: SkillLoadParams): SkillResolvedResult {
  const agentDir = getAgentDir();
  const key = JSON.stringify([agentDir, params.directories, params.isInherited]);
  const cacheId = `${params.botId}:${params.isInherited}`;
  const now = Date.now();

  const catalog = match(deps.catalogs.get(cacheId))
    .with({ key, expiresAt: P.number.gt(now) }, ({ result }) => result)
    .otherwise(() => {
      const result = skillResolveCatalog();
      deps.catalogs.set(cacheId, {
        key,
        expiresAt: now + 30_000,
        result,
      });

      return result;
    });

  return {
    ...catalog,
    skills: catalog.skills.filter((skill) => match(skill.isShared)
      .with(true, () => params.sharedSkills === null || params.sharedSkills.includes(skill.name))
      .with(false, () => !params.disabledSkills?.includes(skill.name))
      .exhaustive()),
  };

  function skillResolveCatalog(): SkillResolvedResult {
    const { root } = deps;
    const { botId, directories, isInherited } = params;
    const directory = join(root, 'agents', botId);
    const localPaths = [join(directory, '.pi/skills'), join(directory, '.agents/skills')];

    const sharedPaths = match(isInherited)
      .with(true, () => skillSharedPaths(root, agentDir, directories))
      .with(false, () => [])
      .exhaustive();

    const local = localPaths.filter(existsSync).flatMap(skillResolveLocal);
    const copies = deps.isSandboxed ? mkdtempSync(join(tmpdir(), 'meetvinci-skills-')) : undefined;

    try {
      const originals = new Map(copies === undefined ? [] : local.flatMap((path, index) => skillResolveCopy(copies, path, index)));

      const result = loadSkills({
        cwd: root,
        agentDir,
        includeDefaults: false,
        skillPaths: [...(copies === undefined ? local : originals.keys()), ...sharedPaths],
      });

      return {
        ...result,
        diagnostics: result.diagnostics.map((diagnostic) => ({ ...diagnostic, path: diagnostic.path && (originals.get(diagnostic.path) ?? diagnostic.path) })),
        skills: result.skills.map((found) => {
          const filePath = originals.get(found.filePath) ?? found.filePath;
          const skill = { ...found, filePath, baseDir: dirname(filePath), sourceInfo: { ...found.sourceInfo, path: filePath, baseDir: dirname(filePath) } };

          return {
            ...skill,
            argumentHint: skillArgumentHint(skill.filePath),
            isShared: !localPaths.some((path) => skill.filePath.startsWith(`${path}/`)),
          };
        }),
      };
    } finally {
      if (copies !== undefined) {
        rmSync(copies, { recursive: true, force: true });
      }
    }
  }

  // SAFETY: Pi re-opens each skill file by path and follows a link to a folder, so a bot swapping a checked file for a FIFO, a huge file or a link to / could stall or exhaust the daemon: Pi reads only private copies made through runtimeBotFiles.
  function skillResolveCopy(folder: string, path: string, index: number): [string, string][] {
    try {
      const content = runtimeBotFilesRead([join(deps.root, 'agents')], path, RUNTIME_BOT_FILES.textMaxBytes);
      const copy = join(folder, String(index), basename(dirname(path)), basename(path));

      mkdirSync(dirname(copy), { recursive: true, mode: RUNTIME_BOT_FILES.directoryMode });
      writeFileSync(copy, content, { mode: 0o600 });

      return [[copy, path]];
    } catch (error) {
      return match(error)
        .with({ code: P.union('FORBIDDEN', 'VALIDATION_ERROR', 'ENOENT') }, () => {
          log.warn({
            tag: 'skills',
            botId: params.botId,
            path,
            message: 'Skipped a bot skill file that links outside the bot folders, is not a plain file or is over 1 MiB.',
          });
          return [];
        })
        .otherwise(() => {
          throw error;
        });
    }
  }

  // SAFETY: Pi's loader reads ignore files in a folder without a type check (a FIFO blocks the daemon): give it checked files.
  function skillResolveLocal(path: string): string[] {
    return match(deps.isSandboxed)
      .with(false, () => [path])
      .with(true, () => {
        try {
          return skillBotFiles(deps.root, path);
        } catch (error) {
          log.warn({
            tag: 'skills',
            botId: params.botId,
            path,
            message: 'Skipped a bot skill folder that links outside the bot folders.',
            error,
          });
          return [];
        }
      })
      .exhaustive();
  }

  function skillArgumentHint(filePath: string): string | null {
    try {
      const { frontmatter } = parseFrontmatter(skillRead(deps, params.directories, filePath));
      return match(frontmatter['argument-hint'])
        .with(P.string, (hint) => hint)
        .otherwise(() => null);
    } catch {
      log.warn({
        tag: 'skills',
        path: filePath,
        message: 'Cannot read skill argument hint.',
      });
      return null;
    }
  }
}
