import { use } from 'react';
import { adminNoticeContext } from '@/context/admin';
import type { AdminNoticeParams } from '@/types/admin.types';

export function useAdminNotice() {
  const show = use(adminNoticeContext);

  return ({ access, email, change }: AdminNoticeParams) => {
    if (access === 'manual') {
      show({ email, change });
    }
  };
}
