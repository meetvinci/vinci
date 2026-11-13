import { makeHttpClient } from '@repo/client/client';
import { Errors } from '@repo/errors/universal';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { globalFile, globalStartRecord } from '../../types/global.types';
import { GLOBAL } from './global.constants';
import type { GlobalFile, GlobalStartRecord } from '../../types/global.types';

export async function globalDriverModified(path: string): Promise<number | null> {
  return stat(path).then(({ mtimeMs }) => mtimeMs, () => null);
}

export async function globalDriverRead(path: string): Promise<GlobalFile> {
  return globalFile.parse(JSON.parse(await readFile(path, 'utf8')));
}

export async function globalDriverWrite(path: string, file: GlobalFile): Promise<number> {
  const draft = `${path}.tmp`;

  await writeFile(draft, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  await rename(draft, path);

  return (await stat(path)).mtimeMs;
}

export async function globalDriverStartRead(path: string): Promise<GlobalStartRecord | null> {
  return readFile(path, 'utf8').then((text) => globalStartRecord.parse(JSON.parse(text)), () => null);
}

export async function globalDriverStartWrite(path: string, record: GlobalStartRecord): Promise<void> {
  const draft = `${path}.tmp`;

  await writeFile(draft, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  await rename(draft, path);
}

export function globalDriverClient(door: (request: Request) => Promise<Response>) {
  return makeHttpClient(() => ({ url: `${GLOBAL.socketOrigin}/rpc`, fetch: (request, init) => door(new Request(request, init)) }));
}

export async function globalDriverAvatar(daemonUrl: string, src: string): Promise<File> {
  const response = await fetch(new URL(src, daemonUrl), { signal: AbortSignal.timeout(10_000) });

  if (!response.ok) {
    throw new Errors.SERVER_UNREACHABLE({ internal: `The template answered ${response.status} for ${src}` });
  }

  return new File([await response.arrayBuffer()], 'avatar.webp', { type: 'image/webp' });
}
