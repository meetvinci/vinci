import { settingsSection } from '@repo/contracts/universal';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { adminGlobalQuery } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';
import { SETTINGS_ADMIN_HIDDEN } from '@/services/settings/settings.constants';

export const Route = createFileRoute('/admin/users/$userId/settings/$tab')({
  beforeLoad: async ({ context, params }) => {
    const tab = settingsSection.safeParse(params.tab);

    if (!tab.success || SETTINGS_ADMIN_HIDDEN.includes(tab.data)) {
      throw notFound();
    }

    const global = params.userId === ADMIN.templateId
      ? await context.queryClient.ensureQueryData(adminGlobalQuery()).catch(() => null)
      : null;

    if (global && !global.sections.some((section) => section.id === tab.data)) {
      throw notFound();
    }
  },
});
