import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { adminNoticeContext } from '@/context/admin';
import { adminHasAccountsQuery } from '@/services/admin/admin.client';
import type { AdminNoticeParams } from '@/types/admin.types';

export function useAdminNotice() {
  const show = use(adminNoticeContext);
  const { data: hasAccounts = false } = useQuery(adminHasAccountsQuery());

  return ({ access, email, change }: AdminNoticeParams) => {
    if (access === 'manual' && !hasAccounts) {
      show({ email, change });
    }
  };
}
