import { Errors } from '@repo/errors/universal';
import { GLOBAL } from './global.constants';
import { globalDriverClient } from './global.driver';
import type * as GlobalTypes from '../../types/global.types';
import type { AdminSection, AdminSectionId } from '@repo/contracts/universal';

export function globalWrittenSection(procedure: string): AdminSectionId | null {
  const path = procedure.toLowerCase();

  if (GLOBAL.reads.includes(path.split('/').at(-1) ?? '')) {
    return null;
  }

  return GLOBAL.sections.find(({ procedures }) => procedures.some((prefix) => (prefix.endsWith('/') ? path.startsWith(prefix.toLowerCase()) : path === prefix.toLowerCase())))?.id ?? null;
}

export function globalSectionState(file: GlobalTypes.GlobalFile, id: string, section: AdminSectionId): GlobalTypes.GlobalSectionState {
  return file.users[id]?.[section] ?? { mode: 'overridden', sync: 'in-sync' };
}

export function globalSections(file: GlobalTypes.GlobalFile, id: string): AdminSection[] {
  return GLOBAL.sections.map(({ id: section }) => ({ id: section, ...globalSectionState(file, id, section) }));
}

export function globalWithSection(
  file: GlobalTypes.GlobalFile,
  id: string,
  section: AdminSectionId,
  next: GlobalTypes.GlobalSectionState,
): GlobalTypes.GlobalFile {
  return { users: { ...file.users, [id]: { ...file.users[id], [section]: next } } };
}

export async function globalSerial<Value>(values: readonly Value[], each: (value: Value) => Promise<void>): Promise<void> {
  await values.reduce(async (previous, value) => {
    await previous;
    await each(value);
  }, Promise.resolve());
}

export async function globalClients(deps: GlobalTypes.GlobalServiceDeps, { user }: GlobalTypes.GlobalClientsParams): Promise<GlobalTypes.GlobalClients> {
  const template = await deps.users.queries.template();

  if (!template) {
    throw new Errors.SERVER_UNREACHABLE({ internal: 'There is no template workspace in users.json: run apply' });
  }

  return {
    template: globalDriverClient((request) => deps.daemons.actions.door({ user: template, request })),
    person: globalDriverClient((request) => deps.daemons.actions.door({ user, request })),
    templateUrl: template.daemonUrl,
  };
}

export async function globalQueue(deps: GlobalTypes.GlobalServiceDeps, id: string, run: () => Promise<void>): Promise<void> {
  const previous = deps.state.queues.get(id) ?? Promise.resolve();
  const current = previous.then(run);
  const settled = current.catch(() => undefined);

  deps.state.queues.set(id, settled);

  try {
    await current;
  } finally {
    if (deps.state.queues.get(id) === settled) {
      deps.state.queues.delete(id);
    }
  }
}
