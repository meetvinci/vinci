import { mkdir, readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { match, P } from 'ts-pattern';
import { mcpDocument, mcpServer } from '@repo/runtime/server';
import { MCP } from './mcp.constants';
import type { McpFileEntry, McpFileServers, McpServiceDeps } from '../../types/mcp.types';

export async function mcpFiles(path: string, visited = new Set<string>()): Promise<string[]> {
  const canonical = await realpath(path);

  return match(visited.has(canonical))
    .with(true, () => [])
    .with(false, async () => {
      const ancestors = new Set([...visited, canonical]);
      const entry = await stat(canonical);

      return match(entry.isDirectory())
        .with(false, () => [canonical])
        .with(true, async () => {
          const entries = await readdir(canonical, { withFileTypes: true });

          const results = await Promise.all(entries
            .filter((child) => !['node_modules', '.git'].includes(child.name))
            .map(async (child) => {
              const childPath = join(canonical, child.name);

              const isDirectory = child.isDirectory()
              || (child.isSymbolicLink() && (await stat(childPath)).isDirectory());

              const shouldScan = isDirectory || child.name === 'mcp.json' || child.name.endsWith('.mcp.json');

              return match(shouldScan)
                .with(true, () => mcpFiles(childPath, ancestors))
                .with(false, () => [])
                .exhaustive();
            }));

          return [...new Set(results.flat())].sort();
        })
        .exhaustive();
    })
    .exhaustive();
}

export function mcpFilesIsInside(folder: string, path: string) {
  const inner = relative(folder, path);

  return inner !== '' && !isAbsolute(inner) && inner.split(sep)[0] !== '..';
}

export function mcpFilesOwnedPath({ root }: Pick<McpServiceDeps, 'root'>, botId: string) {
  return join(root, 'data', 'bots', botId, MCP.ownedFile);
}

export async function mcpFilesRead(deps: Pick<McpServiceDeps, 'root'>, botId: string): Promise<{ mcpServers: McpFileServers }> {
  const path = mcpFilesOwnedPath(deps, botId);

  try {
    return mcpDocument.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    return match(error)
      .with({ code: 'ENOENT' }, () => ({ mcpServers: {} }))
      .otherwise((failure) => {
        throw failure;
      });
  }
}

export async function mcpFilesWrite(deps: Pick<McpServiceDeps, 'root'>, botId: string, document: { mcpServers: Record<string, McpFileEntry> }) {
  const path = mcpFilesOwnedPath(deps, botId);
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export function mcpFilesDerivedKey(botId: string, name: string, index: number) {
  return `${MCP.derivedPrefix}${botId}.${name}.${index}`;
}

export function mcpFilesReferences(entry: McpFileEntry): { key: string; host: string | null }[] {
  const server = mcpServer.safeParse(entry).data;

  return match(server)
    .with({ url: P.string }, ({ url, headerCredentials = {} }) => Object.values(headerCredentials).map((key) => ({ key, host: new URL(url).hostname })))
    .with({ command: P.string }, ({ envCredentials = {} }) => Object.values(envCredentials).map((key) => ({ key, host: null })))
    .otherwise(() => []);
}

export async function mcpFilesDerivedRelease(deps: Pick<McpServiceDeps, 'credentials'>, botId: string, entries: McpFileEntry[], keep = new Set<string>()) {
  const prefix = `${MCP.derivedPrefix}${botId}.`;

  const keys = new Set(entries.flatMap((entry) => mcpFilesReferences(entry))
    .map(({ key }) => key)
    .filter((key) => key.startsWith(prefix) && !keep.has(key)));

  const { set } = deps.credentials.actions;
  await Promise.all([...keys].map((key) => set({ key, value: null })));
}
