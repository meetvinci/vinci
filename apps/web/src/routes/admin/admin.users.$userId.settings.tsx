import { useRpc } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { useQueries, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { AdminSectionActions, AdminSectionNotice } from '@/components/admin/admin-section';
import { AdminUserGate } from '@/components/admin/admin-user';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { adminGlobalQuery, adminUserSectionsQuery } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminQueriesStatus } from '@/services/admin/admin.utils';
import { seoHead } from '@/services/seo/seo.utils';
import { settingsDialogState } from '@/services/settings/settings.utils';

export const Route = createFileRoute('/admin/users/$userId/settings')({
  head: () => seoHead({ title: m.settings_title() }),
  component: AdminUserSettingsRoute,
});

function AdminUserSettingsRoute() {
  const navigate = useNavigate();
  const { userId } = Route.useParams();
  const { tab, model, providerId } = useParams({ strict: false });
  const { rpc } = useRpc();
  const isTemplate = userId === ADMIN.templateId;
  const global = useQuery({ ...adminGlobalQuery(), enabled: isTemplate });
  const sections = useQuery({ ...adminUserSectionsQuery({ userId }), enabled: !isTemplate });

  const settings = useQueries({
    queries: [
      rpc.providers.list.queryOptions(),
      rpc.tools.settings.queryOptions(),
      rpc.conversation.settings.queryOptions(),
      rpc.skills.settings.queryOptions(),
      rpc.instructions.settings.queryOptions(),
      rpc.plugins.settings.queryOptions(),
      rpc.mcp.settings.queryOptions(),
    ],
  });

  const state = settingsDialogState({
    isTheme: false,
    tab,
    model,
    deviceId: undefined,
    providerId,
  });

  if (!state) {
    return null;
  }

  const current = sections.data?.find((item) => item.id === state.section);

  return (
    <AdminUserGate status={adminQueriesStatus([...settings, isTemplate ? global : sections])}>
      <SettingsDialog
        connection={null}
        deviceId={undefined}
        frame={current ? {
          actions: <AdminSectionActions section={current} userId={userId} />,
          notice: <AdminSectionNotice section={current} userId={userId} />,
          isLocked: current.mode === 'global',
        } : null}
        modelKey={model}
        providerId={providerId}
        section={state.section}
        sections={global.data?.sections.map((section) => section.id)}
        variant="page"
        view={state.view}
        onClose={() => void navigate({ to: '/admin/users' })}
      />
    </AdminUserGate>
  );
}
