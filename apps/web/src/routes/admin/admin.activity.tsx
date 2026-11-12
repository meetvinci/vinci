import { adminAuditFilter } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { createFileRoute } from '@tanstack/react-router';
import { AdminActivity } from '@/components/admin/admin-activity';
import { seoHead } from '@/services/seo/seo.utils';

export const Route = createFileRoute('/admin/activity')({
  validateSearch: adminAuditFilter,
  head: () => seoHead({ title: m.admin_activity_title() }),
  component: AdminActivityRoute,
});

function AdminActivityRoute() {
  const filter = Route.useSearch();

  return <AdminActivity filter={filter} />;
}
