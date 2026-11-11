import { readFile, stat } from 'node:fs/promises';
import { userFile } from '../../types/user.types';

export async function userDriverRead(path: string) {
  return userFile.parse(JSON.parse(await readFile(path, 'utf8')));
}

export async function userDriverModified(path: string): Promise<number | null> {
  return stat(path).then(({ mtimeMs }) => mtimeMs, () => null);
}
