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

// Script can reach outside through WebRTC, a meta refresh or `http-equiv` through navigation, and links and frames through the connections in `htmlInert`, none of which a content security policy stops.
// An attribute starts after a space, a slash or a closing quote (`<svg/onload=`, `<img src="x"onerror=`).
export function htmlHasOutside(html: string): boolean {
  return /<(?:script|link|i?frame|template)\b|[\s"'/]on[a-z]+\s*=|javascript:|http-equiv/iu.test(html);
}

// A fresh nonce per frame, so only the app's bootstrap runs in a page that should have no script of its own.
export function htmlNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Chrome connects for `link` (prerender fetches, preconnect and dns-prefetch) and for a frame's address before its CSP and sandbox refuse them, so a held page loses them; a template could carry them into a shadow root. DOMParser loads nothing.
export function htmlInert(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  for (const element of parsed.querySelectorAll('link, iframe, frame, template')) {
    element.remove();
  }

  return parsed.head.innerHTML + parsed.body.innerHTML;
}

// Names one exact page (53-bit cyrb53), so a page that changes in any way asks again before it runs.
export function htmlPageKey(html: string): string {
  let first = 0xDE_AD_BE_EF;
  let second = 0x41_C6_CE_57;

  for (let index = 0; index < html.length; index += 1) {
    const code = html.charCodeAt(index);
    first = Math.imul(first ^ code, 2_654_435_761);
    second = Math.imul(second ^ code, 1_597_334_677);
  }

  first = Math.imul(first ^ (first >>> 16), 2_246_822_507) ^ Math.imul(second ^ (second >>> 13), 3_266_489_909);
  second = Math.imul(second ^ (second >>> 16), 2_246_822_507) ^ Math.imul(first ^ (first >>> 13), 3_266_489_909);

  return (4_294_967_296 * (2_097_151 & second) + (first >>> 0)).toString(36);
}

// A page without script never receives the theme message, so its own document carries the app's tokens.
export function htmlFrameTheme(appearance: string): string {
  const styles = getComputedStyle(document.documentElement);

  return `:root{color-scheme:${appearance};${THEME_CONFIG.tokens.map((token) => `${token}:${styles.getPropertyValue(token)}`).join(';')}}`;
}
