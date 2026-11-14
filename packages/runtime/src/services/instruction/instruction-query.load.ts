import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { log } from '@repo/logger/server';
import { readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { match, P } from 'ts-pattern';
import { runtimeSandboxRead } from '../runtime/runtime-sandbox.utils';
import { INSTRUCTION } from './instruction.constants';
import type { InstructionLoaderServiceDeps, InstructionLoadParams, InstructionLoadResult } from '../../types/instruction.types';

export async function instructionQueryLoad(
  { root, isSandboxed }: InstructionLoaderServiceDeps,
  { botId, paths, isInherited }: InstructionLoadParams,
): Promise<InstructionLoadResult> {
  const botDirectory = join(root, 'agents', botId);

  const sources = [
    ...match(isInherited)
      .with(true, () => [
        { path: getAgentDir(), isOptional: true },
        ...paths.map((path) => ({ path, isOptional: path === INSTRUCTION.defaultPath })),
      ])
      .with(false, () => [])
      .exhaustive(),
    { path: botDirectory, isOptional: true },
  ];

  const results = await Promise.all(sources.map(async (source) => {
    const diagnostics: InstructionLoadResult['diagnostics'] = [];
    const files = await instructionQueryLoadSource(instructionQueryLoadResolve(source.path), source.isOptional, diagnostics);
    return { files, diagnostics };
  }));

  const files: InstructionLoadResult['files'] = [];
  const diagnostics = results.flatMap((result) => result.diagnostics);
  const seen = new Set<string>();

  for (const file of results.flatMap((result) => result.files)) {
    match(seen.has(file.path))
      .with(true, () => undefined)
      .with(false, () => {
        seen.add(file.path);
        files.push(file);
      })
      .exhaustive();
  }

  for (const diagnostic of diagnostics) {
    log.warn({
      tag: 'instructions',
      botId,
      ...diagnostic,
    });
  }

  return { files, diagnostics };

  async function instructionQueryLoadSource(
    path: string,
    isOptional: boolean,
    issues: InstructionLoadResult['diagnostics'],
  ): Promise<InstructionLoadResult['files']> {
    try {
      const entry = await stat(path);

      return await match(entry.isDirectory())
        .with(true, () => instructionQueryLoadDirectory(path, isOptional, issues))
        .with(false, () => match(entry.isFile())
          .with(true, () => instructionQueryLoadFile(path, issues))
          .with(false, () => {
            issues.push({ path, message: INSTRUCTION.message });
            return [];
          })
          .exhaustive())
        .exhaustive();
    } catch (error) {
      match({ isOptional, error })
        .with({ isOptional: true, error: { code: 'ENOENT' } }, () => undefined)
        .otherwise(() => issues.push({ path, message: INSTRUCTION.message }));
      return [];
    }
  }

  async function instructionQueryLoadDirectory(
    directory: string,
    isOptional: boolean,
    issues: InstructionLoadResult['diagnostics'],
  ): Promise<InstructionLoadResult['files']> {
    const names = INSTRUCTION.names.values();
    return instructionNext();

    async function instructionNext(): Promise<InstructionLoadResult['files']> {
      return match(names.next().value)
        .with(P.string, async (name) => {
          const path = join(directory, name);

          const entry = await stat(path).catch((error: unknown) => match(error)
            .with({ code: 'ENOENT' }, () => undefined)
            .otherwise(() => {
              throw error;
            }));

          return match(entry?.isFile())
            .with(true, () => instructionQueryLoadFile(path, issues))
            .otherwise(() => instructionNext());
        })
        .otherwise(() => {
          match(isOptional)
            .with(true, () => undefined)
            .with(false, () => issues.push({ path: directory, message: INSTRUCTION.message }))
            .exhaustive();
          return [];
        });
    }
  }

  async function instructionQueryLoadFile(
    path: string,
    issues: InstructionLoadResult['diagnostics'],
  ): Promise<InstructionLoadResult['files']> {
    try {
      const canonical = await realpath(path);

      // SAFETY: a sandboxed bot can swap its instruction file for a link to the daemon's files between two reads.
      return await match(isSandboxed && path.startsWith(`${botDirectory}${sep}`))
        .with(true, () => {
          try {
            return [{ path: canonical, content: runtimeSandboxRead(path, [join(root, 'agents')]) }];
          } catch (error) {
            return match(error)
              .with({ code: 'FORBIDDEN' }, () => {
                log.warn({
                  tag: 'instructions',
                  botId,
                  message: 'Skipped a bot instruction file that links outside the bot folders',
                  path,
                });
                return [];
              })
              .otherwise(() => {
                throw error;
              });
          }
        })
        .with(false, async () => [{
          path: canonical,
          content: await readFile(canonical, 'utf8'),
        }])
        .exhaustive();
    } catch {
      issues.push({ path, message: INSTRUCTION.message });
      return [];
    }
  }

  function instructionQueryLoadResolve(path: string) {
    return resolve(root, match(path)
      .with('~', () => homedir())
      .when((value) => value.startsWith('~/'), (value) => join(homedir(), value.slice(2)))
      .otherwise((value) => value));
  }
}
