import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminSetSectionMode } from '@/services/admin/admin.client';
import { adminRpcPrefix } from '@/services/admin/admin.utils';
import type { AdminSectionParams } from '@/types/admin.types';
import type { AdminSectionMode } from '@repo/contracts/universal';

export function useAdminSectionMode({ userId, section }: AdminSectionParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mode: AdminSectionMode) => adminSetSectionMode({
      userId,
      section: section.id,
      mode,
    }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'sections'] }),
      queryClient.invalidateQueries({ queryKey: [adminRpcPrefix(userId)] }),
    ]),
  });
}
