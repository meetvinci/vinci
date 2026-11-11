import { accessQueryVerify } from './access-query.verify';
import type * as AccessTypes from '../../types/access.types';

export function makeAccessService(params: AccessTypes.AccessServiceParams) {
  const deps: AccessTypes.AccessServiceDeps = {
    ...params,
    state: { keys: new Map(), fetchedAt: 0, attemptedAt: 0, loading: null },
  };

  return {
    queries: {
      verify: (input: AccessTypes.AccessVerifyParams) => accessQueryVerify(deps, input),
    },
  };
}

export type AccessService = ReturnType<typeof makeAccessService>;
