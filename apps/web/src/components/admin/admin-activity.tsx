import { getLocale, m } from '@repo/i18n/client';
import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { EmptyCompact } from '@repo/ui/empty';
import { Panel, PanelContent, PanelDescription, PanelRow, PanelTitle } from '@repo/ui/panel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { Skeleton } from '@repo/ui/skeleton';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { adminAdminsQuery, adminAuditQuery, adminUsersQuery } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';
import { adminAuditSentence } from '@/services/admin/admin.utils';
import IconActivity from '~icons/lucide/activity';
import IconTriangleAlert from '~icons/lucide/triangle-alert';
import type { AdminAuditEntry, AdminAuditFilter } from '@repo/contracts/universal';

const ANY = 'any';

interface AdminActivityProps {
  filter: AdminAuditFilter
}

export function AdminActivity({ filter }: AdminActivityProps) {
  const navigate = useNavigate();
  const activity = useInfiniteQuery(adminAuditQuery(filter));
  const { data: users = [] } = useQuery(adminUsersQuery());
  const { data: admins = [] } = useQuery(adminAdminsQuery());
  const entries = activity.data?.pages.flatMap((page) => page.entries) ?? [];
  const isFiltered = [filter.by, filter.user, filter.kind].some(Boolean);
  const adminOptions = [...new Set([...admins.map((admin) => admin.email), ...filter.by ? [filter.by] : []])];
  const people = [...users.map((user) => user.id), ADMIN.templateId];
  const personOptions = filter.user && !people.includes(filter.user) ? [...people, filter.user] : people;
  const personName = (id: string) => (id === ADMIN.templateId ? m.admin_global_title() : users.find((user) => user.id === id)?.name ?? id);

  const setFilter = (change: AdminAuditFilter) => void navigate({
    to: '/admin/activity',
    search: { ...filter, ...change },
    replace: true,
  });

  return (
    <>
      <AdminPageHeader description={m.admin_activity_hint()} title={m.admin_activity_title()} />
      <fieldset aria-label={m.admin_activity_filters()} className="flex max-w-4xl flex-wrap gap-2">
        <Select value={filter.by ?? ANY} onValueChange={(value) => setFilter({ by: value === ANY ? undefined : value })}>
          <SelectTrigger aria-label={m.admin_activity_filter_admin()} className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{m.admin_activity_any_admin()}</SelectItem>
            {adminOptions.map((email) => <SelectItem key={email} value={email}>{email}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter.user ?? ANY} onValueChange={(value) => setFilter({ user: value === ANY ? undefined : value })}>
          <SelectTrigger aria-label={m.admin_activity_filter_person()} className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{m.admin_activity_any_person()}</SelectItem>
            {personOptions.map((id) => <SelectItem key={id} value={id}>{personName(id)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter.kind ?? ANY} onValueChange={(value) => setFilter({ kind: value === 'read' || value === 'change' ? value : undefined })}>
          <SelectTrigger aria-label={m.admin_activity_filter_kind()} className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{m.admin_activity_any_kind()}</SelectItem>
            <SelectItem value="read">{m.admin_activity_kind_read()}</SelectItem>
            <SelectItem value="change">{m.admin_activity_kind_change()}</SelectItem>
          </SelectContent>
        </Select>
      </fieldset>
      {activity.isPending ? <Skeleton className="h-64 w-full max-w-4xl" /> : null}
      {activity.isError ? (
        <EmptyCompact icon={<IconTriangleAlert />} title={m.admin_activity_failed()}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void activity.refetch()}
          >
            {m.layout_retry()}
          </Button>
        </EmptyCompact>
      ) : null}
      {activity.isSuccess && entries.length === 0 ? (
        <EmptyCompact
          description={isFiltered ? m.admin_activity_empty_filtered_hint() : m.admin_activity_empty_hint()}
          icon={<IconActivity />}
          title={isFiltered ? m.admin_activity_empty_filtered() : m.admin_activity_empty()}
        >
          {isFiltered ? (
            <Button
              asChild
              size="sm"
              variant="outline"
            >
              <Link replace to="/admin/activity">{m.admin_activity_clear()}</Link>
            </Button>
          ) : null}
        </EmptyCompact>
      ) : null}
      {entries.length > 0 ? (
        <div className="flex max-w-4xl flex-col gap-3">
          <Panel>
            {entries.map((entry) => (
              <AdminActivityRow
                entry={entry}
                key={entry.id}
                person={entry.userId === null ? null : personName(entry.userId)}
              />
            ))}
          </Panel>
          {activity.hasNextPage ? (
            <Button
              className="self-center"
              disabled={activity.isFetchingNextPage}
              variant="outline"
              onClick={() => void activity.fetchNextPage()}
            >
              {m.admin_activity_more()}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

interface AdminActivityRowProps {
  entry: AdminAuditEntry
  person: string | null
}

function AdminActivityRow({ entry, person }: AdminActivityRowProps) {
  const at = new Date(entry.createdAt);
  const filterLink = 'underline-offset-2 hover:text-foreground hover:underline';

  return (
    <PanelRow className="flex-wrap items-start">
      <PanelContent className="min-w-56">
        <PanelTitle>{adminAuditSentence(entry)}</PanelTitle>
        <PanelDescription>
          <span className="flex flex-wrap gap-x-2">
            <Link
              replace
              className={filterLink}
              search={(previous) => ({ ...previous, by: entry.by })}
              to="/admin/activity"
            >
              {entry.by}
            </Link>
            {entry.userId !== null ? (
              <Link
                replace
                className={filterLink}
                search={(previous) => ({ ...previous, user: entry.userId ?? undefined })}
                to="/admin/activity"
              >
                {person}
              </Link>
            ) : null}
            {entry.botId !== null ? <span className="font-mono" title={entry.botId}>{m.admin_activity_bot({ bot: entry.botId.slice(0, 8) })}</span> : null}
            {entry.conversationId !== null ? <span>{m.admin_activity_conversation({ conversation: String(entry.conversationId) })}</span> : null}
          </span>
        </PanelDescription>
      </PanelContent>
      {entry.status >= 400 ? <Badge variant="destructive">{m.admin_activity_status({ status: String(entry.status) })}</Badge> : null}
      <time className="text-xs whitespace-nowrap text-muted-foreground tabular-nums" dateTime={at.toISOString()}>
        {new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(at)}
      </time>
    </PanelRow>
  );
}
