import { match } from 'ts-pattern';
import type * as CoreTypes from '../types/core.types';

const SIGN_OUT = '/cdn-cgi/access/logout';

const STYLE = [
  ':root{color-scheme:light dark;--bg:#fafafa;--fg:#18181b;--muted:#52525b;--line:#e4e4e7}',
  '@media (prefers-color-scheme:dark){:root{--bg:#09090b;--fg:#fafafa;--muted:#a1a1aa;--line:#27272a}}',
  'body{margin:0;min-height:100svh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}',
  'main{max-width:28rem;margin:16px;padding:24px;border:1px solid var(--line);border-radius:12px}',
  'h1{font-size:1.25rem;margin:0 0 12px}p{margin:0 0 12px;color:var(--muted)}b{color:var(--fg);word-break:break-all}a{color:inherit}',
].join('');

export function coreRefusalWanted(request: Request): boolean {
  return (request.method === 'GET' || request.method === 'HEAD') && (request.headers.get('accept') ?? '').includes('text/html');
}

export function coreRefusalPage({ email, reason }: CoreTypes.CoreRefusal): Response {
  const who = `<b>${Bun.escapeHTML(email)}</b>`;

  const [title, ...lines] = match(reason)
    .with('not-admin', () => [
      'This page is for admins',
      `You are signed in as ${who}, which is not an admin of this Orbs workspace.`,
      'Ask one of its admins to add you in the admin panel, under Admins.',
      `<a href="/">Open your own workspace</a> · <a href="${SIGN_OUT}">Sign out</a>`,
    ])
    .with('no-user', () => [
      'No workspace for this email',
      `You are signed in as ${who}, but this Orbs workspace has no user with that email.`,
      'Ask your team\'s Orbs admin to add you in the admin panel. If you have another email for work, sign out and sign in with that one.',
      `<a href="${SIGN_OUT}">Sign out</a>`,
    ])
    .exhaustive();

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${STYLE}</style></head><body><main><h1>${title}</h1>${lines.map((line) => `<p>${line}</p>`).join('')}</main></body></html>`;

  return new Response(html, {
    status: 403,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    },
  });
}
