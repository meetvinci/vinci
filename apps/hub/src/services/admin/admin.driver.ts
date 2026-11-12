import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { adminFile } from '../../types/admin.types';

export async function adminDriverRead(path: string): Promise<string[]> {
  return adminFile.parse(JSON.parse(await readFile(path, 'utf8')));
}

export async function adminDriverModified(path: string): Promise<number | null> {
  return stat(path).then(({ mtimeMs }) => mtimeMs, () => null);
}

export async function adminDriverWrite(path: string, admins: string[]): Promise<number | null> {
  const draft = `${path}.tmp`;

  await writeFile(draft, `${JSON.stringify({ admins }, null, 2)}\n`, { mode: 0o600 });
  await rename(draft, path);

  return adminDriverModified(path);
}
