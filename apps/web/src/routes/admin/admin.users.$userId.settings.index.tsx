import { createFileRoute, redirect } from '@tanstack/react-router';
import { adminGlobalQuery } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';

export const Route = createFileRoute('/admin/users/$userId/settings/')({
  beforeLoad: async ({ context, params }) => {
    const isTemplate = params.userId === ADMIN.templateId;
    const global = isTemplate ? await context.queryClient.ensureQueryData(adminGlobalQuery()).catch(() => null) : null;

    throw redirect({
      to: '/admin/users/$userId/settings/$tab',
      params: { ...params, tab: global?.sections.at(0)?.id ?? (isTemplate ? 'models' : 'chat') },
      replace: true,
    });
  },
});
