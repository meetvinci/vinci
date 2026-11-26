import { HeadContent, Scripts, useParams } from '@tanstack/react-router';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { RootProvider } from 'fumadocs-ui/provider/tanstack';
import { DOCS } from '@/services/docs/docs.constants';
import { docsTranslations } from '@/services/docs/docs.utils';
import type { ReactNode } from 'react';

interface DocsRootDocumentProps {
  children: ReactNode;
}

export function DocsRootDocument({ children }: DocsRootDocumentProps) {
  const { lang = DOCS.defaultLanguage } = useParams({ strict: false });

  return (
    <html suppressHydrationWarning lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col">
        <RootProvider i18n={i18nProvider(docsTranslations, lang)} search={{ enabled: false }}>
          {children}
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
