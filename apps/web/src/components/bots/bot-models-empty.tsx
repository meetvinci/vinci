import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { useQuery } from '@tanstack/react-query';
import { Link, linkOptions, useParams } from '@tanstack/react-router';
import { match } from 'ts-pattern';
import { useSectionScope } from '@/hooks/use-section-scope';
import { useTeam } from '@/hooks/use-team';
import { adminUserSectionsQuery } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminSectionScope } from '@/services/admin/admin.utils';

export function BotModelsEmpty() {
  const scope = useSectionScope();
  const team = useTeam();
  const { userId = ADMIN.templateId } = useParams({ strict: false });
  const isPerson = scope.isAdmin && userId !== ADMIN.templateId;
  const { data: sections } = useQuery({ ...adminUserSectionsQuery({ userId }), enabled: isPerson });
  const models = isPerson ? sections?.find((section) => section.id === 'models') : undefined;

  if (!scope.isAdmin && !team.isAdvanced) {
    return <p className="text-sm text-muted-foreground">{m.rooms_bot_models_none_user()}</p>;
  }

  const target = match({
    isAdmin: scope.isAdmin,
    mode: models?.mode,
    sync: models?.sync,
  })
    .with({ isAdmin: false }, () => ({ hint: m.rooms_bot_models_none_own(), action: m.rooms_bot_models_none_own_action(), link: scope.settings.section('models') }))
    .with({ mode: 'overridden' }, () => ({ hint: m.rooms_bot_models_none_person(), action: m.rooms_bot_models_none_person_action(), link: scope.settings.section('models') }))
    .with({ sync: 'pending' }, () => ({ hint: m.rooms_bot_models_none_pending(), action: null, link: null }))
    .with({ sync: 'failed' }, () => ({
      hint: m.rooms_bot_models_none_failed(),
      action: m.rooms_bot_models_none_failed_action(),
      link: linkOptions({ to: '/admin/users/$userId/status', params: { userId: ADMIN.templateId } }),
    }))
    .otherwise(() => ({ hint: m.rooms_bot_models_none_global(), action: m.rooms_bot_models_none_global_action(), link: adminSectionScope(ADMIN.templateId).settings.section('models') }));

  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">{target.hint}</p>
      {target.link ? (
        <Button
          asChild
          size="sm"
          variant="outline"
        >
          <Link {...target.link}>{target.action}</Link>
        </Button>
      ) : null}
    </div>
  );
}
