import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { resolve } from 'node:path';
import { match, P } from 'ts-pattern';
import { runtimeSandboxNative } from './runtime-sandbox.utils';

export function runtimeEnvNative({ root, sandboxDir, bridge }: { root: string; sandboxDir?: string; bridge: string }) {
  return match(sandboxDir)
    .with(P.string, (folder) => runtimeSandboxNative({
      root,
      folder,
      bridge,
    }))
    .otherwise(() => ({
      env: ({ cwd = '.' }: { cwd?: string }) => new NodeExecutionEnv({ cwd: resolve(root, cwd) }),
      spawn: undefined,
      close: () => undefined,
    }));
}
