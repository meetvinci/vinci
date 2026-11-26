import { log } from '@repo/logger/server';
import { ACCOUNTS } from './accounts.constants';
import type * as AccountsTypes from '../../types/accounts.types';

export function accountsPath({ email, suffix = '' }: AccountsTypes.AccountsPathParams): string {
  return `${ACCOUNTS.usersPath}${encodeURIComponent(email)}${suffix}`;
}

export function accountsRecord(deps: AccountsTypes.AccountsServiceDeps, { action, email, userId, by, status }: AccountsTypes.AccountsRecordParams): void {
  try {
    deps.audit.actions.record({
      by,
      kind: 'change',
      action,
      detail: email,
      userId,
      status,
    });
  } catch (error) {
    log.error({
      tag: 'hub-audit',
      message: 'The audit trail could not record an accounts call; the change stands',
      by,
      action,
      user: userId,
      error,
    });
  }
}
