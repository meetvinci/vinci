import { useQuery } from '@tanstack/react-query';
import { adminRpc } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';

export function useAdminTemplateBots() {
  const { rpc } = adminRpc({ userId: ADMIN.templateId });

  return useQuery(rpc.bots.list.queryOptions());
}
