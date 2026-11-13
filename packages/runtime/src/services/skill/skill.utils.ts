import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { match } from 'ts-pattern';

export function skillSharedPaths(root: string, agentDir: string, directories: string[]): string[] {
  return [...directories.map((path) => resolve(root, match(path)
    .with('~', () => homedir())
    .when((value) => value.startsWith('~/'), (value) => join(homedir(), value.slice(2)))
    .otherwise((value) => value))), join(agentDir, 'skills')].filter(existsSync);
}
