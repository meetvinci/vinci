import { Errors } from '@repo/errors/universal';
import { globalActionReload } from './global-action.reload';
import { globalDriverWrite } from './global.driver';
import type * as GlobalTypes from '../../types/global.types';

export async function globalActionSave(deps: GlobalTypes.GlobalServiceDeps, { change }: GlobalTypes.GlobalSaveParams): Promise<void> {
  await globalActionReload(deps);

  if (deps.state.isBroken) {
    throw new Errors.INTERNAL_ERROR({ internal: 'global_state_unreadable' });
  }

  deps.state.file = change(deps.state.file);
  deps.state.pending += 1;

  const { file } = deps.state;

  const saved = deps.state.saving.then(async () => {
    deps.state.mtimeMs = await globalDriverWrite(deps.path, file);
  }).finally(() => {
    deps.state.pending -= 1;
  });

  deps.state.saving = saved.catch(() => undefined);
  await saved;
}
