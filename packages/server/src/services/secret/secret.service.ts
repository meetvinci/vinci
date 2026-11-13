import { secretActionConfigure } from './secret-action.configure';
import { secretActionImport } from './secret-action.import';
import { secretActionRemove } from './secret-action.remove';
import { secretActionSave } from './secret-action.save';
import { secretQueryExport } from './secret-query.export';
import { secretQueryIsGlobal } from './secret-query.is-global';
import { secretQueryIsGlobalKey } from './secret-query.is-global-key';
import { secretQueryRules } from './secret-query.rules';
import { secretQuerySettings } from './secret-query.settings';
import { secretQueryValue } from './secret-query.value';
import type * as SecretTypes from '../../types/secret.types';
import type * as UniversalTypes from '@repo/contracts/universal';

export function makeSecretService(deps: SecretTypes.SecretServiceDeps) {
  return {
    actions: {
      save: (params: UniversalTypes.SecretSaveInput) => secretActionSave(deps, params),
      remove: (params: UniversalTypes.SecretRemoveInput) => secretActionRemove(deps, params),
      configure: (params: UniversalTypes.SecretConfigureInput) => secretActionConfigure(deps, params),
      import: (params: UniversalTypes.SecretExport) => secretActionImport(deps, params),
    },
    queries: {
      rules: () => secretQueryRules(deps),
      value: (params: SecretTypes.SecretValueParams) => secretQueryValue(deps, params),
      settings: () => secretQuerySettings(deps),
      export: () => secretQueryExport(deps),
      isGlobal: (params: SecretTypes.SecretValueParams) => secretQueryIsGlobal(deps, params),
      isGlobalKey: (params: Pick<UniversalTypes.CredentialsSetInput, 'key'>) => secretQueryIsGlobalKey(deps, params),
    },
  };
}

export type SecretService = ReturnType<typeof makeSecretService>;
