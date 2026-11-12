import { botSection } from '@repo/contracts/universal';
import { createFileRoute, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/users/$userId/bots/$botId/$tab')({
  beforeLoad: ({ params }) => {
    if (!botSection.safeParse(params.tab).success) {
      throw notFound();
    }
  },
});
