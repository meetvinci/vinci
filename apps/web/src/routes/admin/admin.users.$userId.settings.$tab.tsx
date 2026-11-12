import { settingsSection } from '@repo/contracts/universal';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { SETTINGS_ADMIN_HIDDEN } from '@/services/settings/settings.constants';

export const Route = createFileRoute('/admin/users/$userId/settings/$tab')({
  beforeLoad: ({ params }) => {
    const tab = settingsSection.safeParse(params.tab);

    if (!tab.success || SETTINGS_ADMIN_HIDDEN.includes(tab.data)) {
      throw notFound();
    }
  },
});
