import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { resolve } from 'node:path';
import { match, P } from 'ts-pattern';
import { runtimeSandboxNative } from './runtime-sandbox.utils';

export function runtimeEnvNative({ root, sandboxDir }: { root: string; sandboxDir?: string }) {
  return match(sandboxDir)
    .with(P.string, (folder) => runtimeSandboxNative({ root, folder }))
    .otherwise(() => ({
      env: ({ cwd = '.' }: { cwd?: string }) => new NodeExecutionEnv({ cwd: resolve(root, cwd) }),
      close: () => undefined,
    }));
}
