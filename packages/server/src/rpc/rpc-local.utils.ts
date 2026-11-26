import { Errors } from '@repo/errors/universal';
import { match, P } from 'ts-pattern';
import { rpcLocalReset } from '../types/rpc.types';
import type { RpcLocalAllowlist, RpcLocalAuthorizeParams, RpcLocalRule } from '../types/rpc.types';

const RPC_LOCAL_ALLOWLIST = {
  server: { info: true, configure: true },
  conversation: { settings: true, configure: true, list: true, history: true, search: true, reactions: true, questions: true },
  artifacts: { get: true, versions: true },
  attachments: { download: true, poster: true },
  notifications: { settings: true, configure: true },
  limits: { settings: true, configure: true },
  providers: { list: true, login: true, complete: true, session: true, cancel: true, logout: true, export: true, import: true },
  models: { list: true, settings: true, configure: true },
  plugins: { discover: true, settings: true, configure: true },
  instructions: { discover: true, settings: true, configure: true },
  skills: { discover: true, shared: true, local: true, settings: true, status: true, configure: true },
  mcp: { discover: true, shared: true, connect: true, add: true, remove: true, get: true, replace: true, settings: true, configure: true },
  mcpAuth: { start: true, complete: true, cancel: true, logout: true, status: true },
  tools: { settings: true, configure: true, export: true, pending: true, servers: true },
  workspace: { export: true, import: true },
  secrets: { list: true, save: true, remove: true, settings: true, configure: true, export: true, import: true },
  credentials: { list: true, set: true },
  bots: { list: true, get: true, catalog: true, create: true, update: true, delete: true, swapModels: true, exportFiles: true, importFiles: true },
  avatars: { upload: true },
  commands: { execute: rpcLocalReset },
  routines: { list: true },
  todos: { list: true },
  devices: { list: true, revoke: true },
  pairing: { bootstrap: true },
} satisfies RpcLocalAllowlist;

const RPC_LOCAL_RULES = new Map<string, RpcLocalRule>(Object.entries(RPC_LOCAL_ALLOWLIST).flatMap(([area, procedures]) => (
  Object.entries(procedures).map(([name, rule]): [string, RpcLocalRule] => [`${area}.${name}`, rule])
)));

export function rpcLocalAuthorize({ isLocal, path, input }: RpcLocalAuthorizeParams): void {
  match({ isLocal, rule: RPC_LOCAL_RULES.get(path.join('.')) })
    .with({ isLocal: false }, { rule: true }, () => undefined)
    .with({ rule: P.when((rule) => rule !== undefined && rule !== true && rule.safeParse(input).success) }, () => undefined)
    .otherwise(() => {
      throw new Errors.FORBIDDEN({ internal: `Not served on the owner socket: ${path.join('.')}` });
    });
}
