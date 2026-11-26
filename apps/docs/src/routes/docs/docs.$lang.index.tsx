import { createFileRoute, redirect } from '@tanstack/react-router';
import { DOCS } from '@/services/docs/docs.constants';

export const Route = createFileRoute('/$lang/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$lang/$', params: { lang: params.lang, _splat: DOCS.homeSlug } });
  },
});
