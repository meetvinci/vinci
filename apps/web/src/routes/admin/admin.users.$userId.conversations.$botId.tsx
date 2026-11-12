import { adminConversationSearch } from '@repo/contracts/universal';
import { createFileRoute } from '@tanstack/react-router';
import { AdminConversation } from '@/components/admin/admin-conversation';

export const Route = createFileRoute('/admin/users/$userId/conversations/$botId')({
  validateSearch: adminConversationSearch,
  component: AdminUserConversationRoute,
});

function AdminUserConversationRoute() {
  const { userId, botId } = Route.useParams();
  const { message } = Route.useSearch();

  return (
    <AdminConversation
      botId={botId}
      entryId={message}
      key={`${userId}:${botId}`}
      userId={userId}
    />
  );
}
