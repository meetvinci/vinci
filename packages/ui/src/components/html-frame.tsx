import { htmlDocument } from '@repo/client/client';
import { THEME_CONFIG, useTheme } from '@repo/client/web';
import { htmlFrameMessage } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { match } from 'ts-pattern';
import { htmlFrameFonts } from '../services/html/html.client';
import { htmlFrameTheme, htmlHasOutside, htmlInert, htmlNonce } from '../services/html/html.utils';
import { OutsideContentNotice, useOutsideContent, useOutsidePage } from './outside-content';

interface HtmlFrameProps {
  html: string
  title: string
}

export function HtmlFrame({ html, title }: HtmlFrameProps) {
  const hasOutside = htmlHasOutside(html);
  const isBlocked = useOutsideContent(hasOutside);
  const page = useOutsidePage(html, hasOutside);

  // Until the browser says whether the person ran this page before, nothing renders (DOMParser is browser only).
  if (page.isHeld === undefined) {
    return null;
  }

  const isHeld = isBlocked || page.isHeld;

  // Without script the page has no WebRTC, no navigation of its own frame and no meta refresh; without links and frames, no early connections; the frame's CSP stops the rest.
  // A page that should have no script runs only the bootstrap, so a page the check misread still runs none of its own.
  return (
    <>
      {page.isHeld ? <OutsideContentNotice action={m.ui_html_run()} text={m.ui_html_held()} onAction={page.onRun} /> : null}
      <HtmlFrameDocument
        hasPageScript={hasOutside}
        html={isHeld ? htmlInert(html) : html}
        key={String(isHeld)}
        sandbox={isHeld ? '' : 'allow-scripts'}
        title={title}
      />
    </>
  );
}

function HtmlFrameDocument({ html, title, sandbox, hasPageScript }: HtmlFrameProps & { sandbox: string, hasPageScript: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const loads = useRef(0);
  const [height, setHeight] = useState(320);
  const [hasLeft, setHasLeft] = useState(false);
  const theme = useTheme();
  const { data: fonts } = useQuery(htmlFrameFonts);
  const [nonce] = useState(htmlNonce);
  const document = htmlDocument(html, sandbox === '' ? htmlFrameTheme(theme.resolved) : '', hasPageScript ? '' : nonce);

  const postTheme = () => {
    const styles = getComputedStyle(window.document.documentElement);
    frame.current?.contentWindow?.postMessage({
      type: 'bots.html-theme',
      appearance: theme.resolved,
      tokens: Object.fromEntries(THEME_CONFIG.tokens.map((token) => [token, styles.getPropertyValue(token)])),
      fonts: fonts ?? [],
    }, '*');
  };

  useEffect(postTheme, [theme.resolved, theme.selected, theme.themes, fonts]);

  useLayoutEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) {
        return;
      }

      const message = htmlFrameMessage.safeParse(event.data);

      if (!message.success) {
        return;
      }
      match(message.data)
        .with({ type: 'bots.html-height' }, ({ height: contentHeight }) => setHeight(Math.max(80, Math.min(1600, contentHeight))))
        .with({ type: 'bots.html-link' }, ({ url }) => {
          if (window.document.activeElement === frame.current && navigator.userActivation.isActive) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        })
        .exhaustive();
    };

    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, []);

  // The srcdoc loads once; a later load is the page sending its own frame to an address the bot chose, so the frame closes.
  const onLoad = () => {
    loads.current += 1;

    return loads.current > 1 ? setHasLeft(true) : postTheme();
  };

  return hasLeft ? <p className="text-sm text-muted-foreground" role="alert">{m.ui_html_left()}</p> : (
    <iframe
      className="block w-full border-0"
      ref={frame}
      referrerPolicy="no-referrer"
      sandbox={sandbox}
      srcDoc={document}
      style={{ height, colorScheme: theme.resolved }}
      title={title}
      onLoad={onLoad}
    />
  );
}
