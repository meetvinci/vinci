import { globalSections } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';

export async function globalQueryStatus(deps: GlobalTypes.GlobalServiceDeps): Promise<GlobalTypes.GlobalStatusUser[]> {
  return (await deps.users.queries.list()).map(({ id }) => ({ id, sections: globalSections(deps.state.file, id) }));
}
