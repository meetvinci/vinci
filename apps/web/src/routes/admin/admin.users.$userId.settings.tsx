import { useRpc } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { useQueries } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { AdminUserGate } from '@/components/admin/admin-user';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { adminQueriesStatus } from '@/services/admin/admin.utils';
import { seoHead } from '@/services/seo/seo.utils';
import { settingsDialogState } from '@/services/settings/settings.utils';

export const Route = createFileRoute('/admin/users/$userId/settings')({
  head: () => seoHead({ title: m.settings_title() }),
  component: AdminUserSettingsRoute,
});

function AdminUserSettingsRoute() {
  const navigate = useNavigate();
  const { tab, model, providerId } = useParams({ strict: false });
  const { rpc } = useRpc();

  const status = useQueries({
    queries: [
      rpc.providers.list.queryOptions(),
      rpc.tools.settings.queryOptions(),
      rpc.conversation.settings.queryOptions(),
      rpc.skills.settings.queryOptions(),
      rpc.instructions.settings.queryOptions(),
      rpc.plugins.settings.queryOptions(),
      rpc.mcp.settings.queryOptions(),
    ],
    combine: adminQueriesStatus,
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

  return (
    <AdminUserGate status={status}>
      <SettingsDialog
        connection={null}
        deviceId={undefined}
        modelKey={model}
        providerId={providerId}
        section={state.section}
        variant="page"
        view={state.view}
        onClose={() => void navigate({ to: '/admin/users' })}
      />
    </AdminUserGate>
  );
}
