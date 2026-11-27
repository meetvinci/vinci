import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { setTimeout as sleep } from 'node:timers/promises';
import { globalActionApply } from './global-action.apply';
import { globalActionReload } from './global-action.reload';
import { globalActionSave } from './global-action.save';
import { GLOBAL } from './global.constants';
import { globalSections, globalSectionState, globalWithSection } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';
import type { ProvisionerUser } from '../../types/provisioner.types';

export async function globalActionStart(deps: GlobalTypes.GlobalServiceDeps, { by, attempts }: GlobalTypes.GlobalStartParams): Promise<void> {
  const deadline = Date.now() + GLOBAL.startWaitMs;

  async function globalPeople(left: number): Promise<ProvisionerUser[]> {
    const listed = await deps.users.queries.list().catch(async (error: unknown) => {
      if (left <= 1) {
        throw error;
      }

      log.warn({
        tag: 'hub',
        message: 'The global sync at start could not list people yet; trying again',
        by,
        error,
      });
      await sleep(GLOBAL.startRetryMs, null, { ref: false });

      return null;
    });

    return listed ?? globalPeople(left - 1);
  }

  async function globalAnswers({ user }: GlobalTypes.GlobalStartWaitParams): Promise<boolean> {
    const isAnswering = await deps.daemons.actions.resolve({ user }).then(() => true, () => false);

    if (isAnswering || Date.now() >= deadline) {
      return isAnswering;
    }

    await sleep(GLOBAL.startRetryMs, null, { ref: false });

    return globalAnswers({ user });
  }

  async function globalCopy({ id, user, sections, attempts: left }: GlobalTypes.GlobalStartCopyParams): Promise<void> {
    await globalActionApply(deps, {
      id,
      sections,
      by,
    });

    const failed = sections.filter((section) => globalSectionState(deps.state.file, id, section).sync === 'failed');

    if (failed.length === 0 || left <= 1 || user === null) {
      return;
    }

    await sleep(GLOBAL.startRetryMs, null, { ref: false });
    await globalAnswers({ user });
    await globalCopy({
      id,
      user,
      sections: failed,
      attempts: left - 1,
    });
  }

  async function globalIsSkipped({ id, state }: ProvisionerUser): Promise<boolean> {
    const sections = globalSections(deps.state.file, id).filter(({ mode }) => mode === 'global').map((section) => section.id);
    const user = await deps.users.queries.get({ id });

    if (sections.length === 0) {
      return false;
    }

    const isStopped = user !== null && !(await globalAnswers({ user }))
      && await deps.users.queries.list().then((listed) => listed.find((entry) => entry.id === id)?.state, () => state) === 'stopped';

    if (isStopped) {
      await globalActionSave(deps, {
        change: (file) => sections.reduce((next, section) => (globalSectionState(next, id, section).mode === 'global'
          ? globalWithSection(next, id, section, { mode: 'global', sync: 'pending' })
          : next), file),
      });
      log.warn({
        tag: 'hub',
        message: 'The global sync at start skipped a person whose Vinci is stopped; Sync now copies once it runs again',
        by,
        user: id,
      });

      return true;
    }

    await globalCopy({
      id,
      user,
      sections,
      attempts: GLOBAL.startCopyAttempts,
    });

    return false;
  }

  const listed = await globalPeople(attempts);
  const template = await deps.users.queries.template();

  await globalActionReload(deps);

  if (template) {
    await globalAnswers({ user: template });
  }

  const skipped = (await Promise.all(listed.map((person) => globalIsSkipped(person)))).filter(Boolean).length;
  const failed = listed.flatMap(({ id }) => globalSections(deps.state.file, id).filter(({ sync }) => sync === 'failed').map(({ id: section }) => `${id}/${section}`));

  log.info({
    tag: 'hub',
    message: 'The global sync at start ended',
    by,
    people: listed.length,
    skipped,
    failed,
  });

  if (failed.length > 0) {
    throw new Errors.SERVER_UNREACHABLE({ internal: `Still failed after the global sync at start: ${failed.join(', ')}` });
  }
}
