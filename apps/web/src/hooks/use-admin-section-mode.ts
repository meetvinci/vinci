import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminSetSectionMode } from '@/services/admin/admin.client';
import { adminRpcPrefix } from '@/services/admin/admin.utils';
import type { AdminSectionParams } from '@/types/admin.types';
import type { AdminSectionModeInput } from '@repo/contracts/universal';

export function useAdminSectionMode({ userId, section }: AdminSectionParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminSectionModeInput) => adminSetSectionMode({
      ...input,
      userId,
      section: section.id,
    }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'sections'] }),
      queryClient.invalidateQueries({ queryKey: [adminRpcPrefix(userId)] }),
    ]),
  });
}
