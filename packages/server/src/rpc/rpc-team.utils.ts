import { Errors } from '@repo/errors/universal';
import type { RpcTeamRefuseParams } from '../types/rpc.types';

export async function rpcTeamRefuse({ context, path, changes }: RpcTeamRefuseParams): Promise<void> {
  if (context.isTeam && !context.isLocal && await changes()) {
    throw new Errors.TEAM_MANAGED({ internal: `Managed by the admin in a team install: ${path}` });
  }
}
