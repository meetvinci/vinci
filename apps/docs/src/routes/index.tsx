import { createFileRoute, redirect } from '@tanstack/react-router';
import { DOCS } from '@/services/docs/docs.constants';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/$lang/$', params: { lang: DOCS.defaultLanguage, _splat: DOCS.homeSlug } });
  },
});
