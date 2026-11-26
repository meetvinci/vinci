import { getRouteApi, Link } from '@tanstack/react-router';
import { docsChangelogVersions } from '@/services/docs/docs.utils';

const route = getRouteApi('/$lang/$');

export function DocsChangelog() {
  const { lang } = route.useParams();

  return (
    <ul className="divide-y divide-fd-border">
      {docsChangelogVersions(lang).map((version) => (
        <li key={version.url}>
          <Link className="-mx-3 flex flex-col gap-1 rounded-lg px-3 py-4 hover:bg-fd-accent" to={version.url}>
            <span className="font-medium">{version.data.title}</span>
            <span className="text-sm text-fd-muted-foreground">{version.data.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
