import { m } from '@repo/i18n/client';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { AdminGlobalStatus } from '@/components/admin/admin-global';
import { ADMIN } from '@/services/admin/admin.constants';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/admin/users/$userId/status')({
  beforeLoad: ({ params }) => {
    if (params.userId !== ADMIN.templateId) {
      throw notFound();
    }
  },
  head: () => seoHead({ title: m.admin_global_status() }),
  component: AdminGlobalStatus,
});
