import { getRouteApi } from '@tanstack/react-router';
import { Callout } from 'fumadocs-ui/components/callout';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { render } from 'pele';
import { useId } from 'react';
import { DOCS_ALERT } from '@/services/docs/docs.constants';
import { docsPageHref } from '@/services/docs/docs.utils';
import type { ComponentProps } from 'react';

const route = getRouteApi('/$lang/$');

interface DocsMdxMermaidProps {
  chart: string;
}

export function DocsMdxMermaid({ chart }: DocsMdxMermaidProps) {
  const id = useId();

  return <div className="my-6 overflow-x-auto" dangerouslySetInnerHTML={{ __html: render(chart, { idPrefix: id }).svg }} />;
}

export function DocsMdxLink({ href, ...props }: ComponentProps<'a'>) {
  const { lang, _splat } = route.useParams();
  const Anchor = defaultMdxComponents.a;

  return <Anchor href={href ? docsPageHref(href, _splat?.split('/') ?? [], lang) : href} {...props} />;
}

interface DocsMdxBlockquoteProps extends ComponentProps<'blockquote'> {
  'data-alert'?: string;
}

export function DocsMdxBlockquote({ 'data-alert': alert, children, ...props }: DocsMdxBlockquoteProps) {
  const type = DOCS_ALERT.calloutTypes.find((calloutType) => calloutType === alert);

  if (!type) {
    return <blockquote {...props}>{children}</blockquote>;
  }

  return <Callout type={type}>{children}</Callout>;
}
