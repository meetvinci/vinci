import { adminSectionId, adminSectionMarker, adminSectionMode, adminSectionSync } from '@repo/contracts/universal';
import { z } from 'zod';
import { userId } from './user.types';
import type { DaemonService } from './daemon.types';
import type * as UserTypes from './user.types';
import type { Client } from '@repo/client/client';
import type * as UniversalTypes from '@repo/contracts/universal';

const globalSectionState = z.strictObject({
  mode: adminSectionMode,
  sync: adminSectionSync,
  error: z.string().optional(),
});

export const globalFile = z.strictObject({ users: z.record(userId, z.partialRecord(adminSectionId, globalSectionState)) });

export const globalModeInput = z.strictObject({ mode: adminSectionMode, marker: adminSectionMarker.optional() });

export const globalSyncInput = z.strictObject({ section: adminSectionId.optional() });

export const globalBotsInput = z.strictObject({ bots: z.array(z.uuid()).min(1).max(50) });

export type GlobalFile = z.infer<typeof globalFile>;

export type GlobalSectionState = z.infer<typeof globalSectionState>;

export interface GlobalServiceParams {
  directory: string;
  users: UserTypes.UserService;
  daemons: DaemonService;
}

export interface GlobalServiceDeps extends Omit<GlobalServiceParams, 'directory'> {
  path: string;
  state: GlobalState;
}

export interface GlobalState {
  file: GlobalFile;
  isBroken: boolean;
  mtimeMs: number | null | undefined;
  saving: Promise<void>;
  pending: number;
  queues: Map<string, Promise<void>>;
  running: Map<UniversalTypes.AdminSectionId, Promise<void>>;
  dirty: Set<UniversalTypes.AdminSectionId>;
  previewKey: Uint8Array;
}

export interface GlobalUserParams {
  id: string;
}

export interface GlobalByParams extends GlobalUserParams {
  by: string;
}

export interface GlobalApplyParams extends GlobalByParams {
  sections: UniversalTypes.AdminSectionId[];
  marker?: string;
}

export type GlobalChange = (file: GlobalFile) => GlobalFile;

export interface GlobalSaveParams {
  change: GlobalChange;
}

export interface GlobalClientsParams {
  user: UserTypes.UserDaemon;
}

export interface GlobalGuardParams extends GlobalUserParams {
  procedure: string;
}

export interface GlobalModeParams extends GlobalUserParams {
  section: UniversalTypes.AdminSectionId;
  mode: UniversalTypes.AdminSectionMode;
  marker?: string;
  by: string;
}

export interface GlobalPreviewParams extends GlobalUserParams {
  section: UniversalTypes.AdminSectionId;
}

export const globalMcpFile = z.string().transform((text, context) => {
  try {
    return JSON.parse(text);
  } catch {
    context.addIssue({ code: 'custom', message: 'validation_invalid' });

    return z.NEVER;
  }
}).pipe(z.looseObject({ mcpServers: z.record(z.string(), z.json()) }));

export type GlobalPreviewGroup = 'keys' | 'oauth' | 'modelsJson' | 'settings' | 'secrets' | 'own' | 'files';

export type GlobalPreviewGroups = Partial<Record<GlobalPreviewGroup, Record<string, string>>> & { isTooLarge?: true };

export interface GlobalPreviewPart {
  kind: UniversalTypes.AdminPreviewKind;
  name: string;
  value: string;
}

export interface GlobalPreviewDiff {
  kind: UniversalTypes.AdminPreviewKind;
  person: Record<string, string>;
  template: Record<string, string>;
}

export interface GlobalSyncParams {
  section?: UniversalTypes.AdminSectionId;
  by: string;
}

export interface GlobalChangedParams extends Pick<GlobalGuardParams, 'procedure'> {
  by: string;
}

export interface GlobalCopyParams {
  user: UserTypes.UserDaemon;
  section: UniversalTypes.AdminSectionId;
}

export interface GlobalBotsParams extends GlobalUserParams {
  bots: string[];
  by: string;
}

export interface GlobalClients {
  template: Client;
  person: Client;
  templateUrl: string;
}

export interface GlobalCreated extends UserTypes.UserChanged {
  bots: UniversalTypes.AdminBotCopy[];
}

export interface GlobalStatusUser {
  id: string;
  sections: UniversalTypes.AdminSection[];
}

export interface GlobalService {
  queries: {
    global: () => Promise<UniversalTypes.AdminGlobal>;
    isBroken: () => Promise<boolean>;
    sections: (params: GlobalUserParams) => UniversalTypes.AdminSection[];
    status: () => Promise<GlobalStatusUser[]>;
    guard: (params: GlobalGuardParams) => UniversalTypes.AdminSectionId | null;
    preview: (params: GlobalPreviewParams) => Promise<UniversalTypes.AdminSectionPreview>;
    section: (params: Pick<GlobalGuardParams, 'procedure'>) => UniversalTypes.AdminSectionId | null;
  };
  actions: {
    mode: (params: GlobalModeParams) => Promise<UniversalTypes.AdminSection>;
    sync: (params: GlobalSyncParams) => Promise<GlobalStatusUser[]>;
    changed: (params: GlobalChangedParams) => void;
    create: (params: UserTypes.UserCreateParams) => Promise<GlobalCreated>;
    update: (params: UserTypes.UserUpdateParams) => Promise<UserTypes.UserChanged>;
    bots: (params: GlobalBotsParams) => Promise<UniversalTypes.AdminBotCopy[]>;
  };
}
