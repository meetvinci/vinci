import { match, P } from 'ts-pattern';
import type * as ProvisionerTypes from '../../types/provisioner.types';

export function provisionerAccessOf({ rule, email }: ProvisionerTypes.ProvisionerAccessOfParams): ProvisionerTypes.ProvisionerAccessState {
  return match(rule.emails)
    .with(P.nullish, () => 'unknown' as const)
    .when((emails) => emails.includes(email) || rule.domains.some((domain) => email.endsWith(`@${domain}`)), () => 'allowed' as const)
    .otherwise(() => 'not-allowed' as const);
}

export function provisionerAccessMode(rule: ProvisionerTypes.ProvisionerAccessRule): ProvisionerTypes.ProvisionerAccessMode {
  return match(rule)
    .when(({ domains }) => domains.length > 0, () => 'domain' as const)
    .with({ emails: P.array() }, () => 'emails' as const)
    .otherwise(() => 'unknown' as const);
}
