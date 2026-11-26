import { log } from '@repo/logger/server';
import { USER } from './user.constants';
import type * as UserTypes from '../../types/user.types';

function userSlug(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z\d]+/gu, '-').slice(0, USER.idMaxLength).replace(/^-+|-+$/gu, '');
}

export function userNewId(name: string, email: string, taken: Set<string>): string {
  const base = userSlug(name) || userSlug(email.split('@')[0] ?? '') || 'user';

  const candidates = Array.from({ length: taken.size + 1 }, (_unused, index) => (index === 0
    ? base
    : `${base.slice(0, USER.idMaxLength - String(index + 1).length - 1).replace(/-+$/u, '')}-${index + 1}`));

  return candidates.find((candidate) => !taken.has(candidate)) ?? base;
}

export async function userAccountUndo(deps: UserTypes.UserServiceDeps, { account, ...target }: UserTypes.UserAccountUndoParams): Promise<void> {
  if (!account?.created) {
    return;
  }

  await deps.accounts.actions.remove(target).catch((error: unknown) => log.error({
    tag: 'hub',
    message: 'The provisioner refused the person, and the login account made for them could not be removed; remove it with the accounts service',
    user: target.userId,
    error,
  }));
}
