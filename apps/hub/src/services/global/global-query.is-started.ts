import { globalDriverStartRead } from './global.driver';
import type * as GlobalTypes from '../../types/global.types';

export async function globalQueryIsStarted(deps: GlobalTypes.GlobalServiceDeps, { version, row }: GlobalTypes.GlobalStartRecord): Promise<boolean> {
  const record = await globalDriverStartRead(deps.startPath);
  const isFailed = Object.values(deps.state.file.users).some((sections) => Object.values(sections).some(({ sync }) => sync === 'failed'));

  return record?.version === version && row !== null && record.row === row && !isFailed;
}
