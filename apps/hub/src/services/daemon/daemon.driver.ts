import { serverHealth } from '@repo/contracts/universal';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { daemonPins } from '../../types/daemon.types';
import { DAEMON } from './daemon.constants';
import type { DaemonPins } from '../../types/daemon.types';

export async function daemonDriverHealth(url: string): Promise<string | null> {
  const response = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(DAEMON.healthTimeoutMs) }).catch(() => null);
  const health = serverHealth.safeParse(response?.ok ? await response.json().catch(() => null) : null);

  return health.data?.id ?? null;
}

export async function daemonDriverPinsRead(path: string): Promise<DaemonPins> {
  const exists = await stat(path).then(() => true, () => false);

  return exists ? daemonPins.parse(JSON.parse(await readFile(path, 'utf8'))) : {};
}

export async function daemonDriverPinsWrite(path: string, pins: DaemonPins): Promise<void> {
  const draft = `${path}.tmp`;

  await writeFile(draft, `${JSON.stringify(pins, null, 2)}\n`, { mode: 0o600 });
  await rename(draft, path);
}
