import { connectionSearch } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { ConnectCard } from '@/components/connect/connect-card';
import { seoHead } from '@/services/seo/seo.utils';
import { teamQuery } from '@/services/team/team.client';

export const Route = createFileRoute('/connect')({
  head: () => seoHead({ title: m.connect_meta_title() }),
  validateSearch: connectionSearch,
  beforeLoad: ({ context }) => {
    if (context.connection) {
      throw redirect({ to: '/rooms' });
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(teamQuery()),
  component: ConnectCard,
});
