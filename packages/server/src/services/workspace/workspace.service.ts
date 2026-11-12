import { workspaceActionBotFiles } from './workspace-action.bot-files';
import { workspaceActionImport } from './workspace-action.import';
import { workspaceActionPrepareDirectory } from './workspace-action.prepare-directory';
import { workspaceActionRemoveDirectory } from './workspace-action.remove-directory';
import { workspaceQueryBotFiles } from './workspace-query.bot-files';
import { workspaceQueryExport } from './workspace-query.export';
import type { WorkspaceBotFilesParams, WorkspaceServiceDeps } from '../../types/workspace.types';
import type { BotGetInput, WorkspaceFiles } from '@repo/contracts/universal';

export function makeWorkspaceService(deps: WorkspaceServiceDeps) {
  return {
    actions: {
      prepareDirectory: (params: BotGetInput) => workspaceActionPrepareDirectory(deps, params),
      removeDirectory: (params: BotGetInput) => workspaceActionRemoveDirectory(deps, params),
      import: (params: WorkspaceFiles) => workspaceActionImport(params),
      importBotFiles: (params: WorkspaceBotFilesParams) => workspaceActionBotFiles(deps, params),
    },
    queries: {
      export: () => workspaceQueryExport(),
      botFiles: (params: BotGetInput) => workspaceQueryBotFiles(deps, params),
    },
  };
}

export type WorkspaceService = ReturnType<typeof makeWorkspaceService>;
