import { htmlReplyContent } from '@repo/client/client';
import { THEME_CONFIG } from '@repo/client/web';
import { parseMarkdownIntoBlocks } from 'streamdown';

export function htmlReplyPage(content: string): boolean {
  return htmlReplyContent(content) !== undefined && htmlReplyBlocks(content).length === 1;
}

export function htmlReplyBlocks(content: string): string[] {
  if (content.trimStart().startsWith('<') && htmlReplyContent(content) !== undefined) {
    return [content];
  }

  return parseMarkdownIntoBlocks(content);
}

// Only inline data stays inside the viewer; any address, a relative one too, is a request its browser would make.
export function htmlIsOutside(url: string): boolean {
  return !/^\s*(?:data|blob):/iu.test(url);
}

// Script can reach outside through WebRTC, and links and frames through the connections in `htmlInert`, none of which a content security policy stops.
export function htmlHasOutside(html: string): boolean {
  return /<(?:script|link|i?frame|template)\b|\son[a-z]+\s*=|javascript:/iu.test(html);
}

// Chrome connects for `link` (prerender fetches, preconnect and dns-prefetch) and for a frame's address before its CSP and sandbox refuse them, so a held page loses them; a template could carry them into a shadow root. DOMParser loads nothing.
export function htmlInert(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  for (const element of parsed.querySelectorAll('link, iframe, frame, template')) {
    element.remove();
  }

  return parsed.head.innerHTML + parsed.body.innerHTML;
}

// A page without script never receives the theme message, so its own document carries the app's tokens.
export function htmlFrameTheme(appearance: string): string {
  const styles = getComputedStyle(document.documentElement);

  return `:root{color-scheme:${appearance};${THEME_CONFIG.tokens.map((token) => `${token}:${styles.getPropertyValue(token)}`).join(';')}}`;
}
