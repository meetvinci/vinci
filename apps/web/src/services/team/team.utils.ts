import { teamWhoami } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { TEAM } from './team.constants';
import type { TeamWhoami } from '@repo/contracts/universal';

export async function teamParse(response: Response): Promise<TeamWhoami | null> {
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Errors.SERVER_UNREACHABLE({ internal: `The hub answered ${String(response.status)} to ${TEAM.whoamiPath}` });
  }

  return teamWhoami.parse(await response.json());
}
