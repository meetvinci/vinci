import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { TLSSocket } from 'node:tls';
import { createBrotliDecompress, createGunzip, createInflate, createZstdDecompress } from 'node:zlib';
import { match } from 'ts-pattern';
import { secretProxyScrubForms, secretProxyScrubStream, secretProxyScrubText } from './secret-proxy-scrub.utils';
import { SECRET_PROXY } from './secret-proxy.constants';
import { secretProxyAllows, secretProxyIsInternal, secretProxyPlaceholder } from './secret-proxy.utils';
import type * as SecretProxyTypes from '../../types/secret-proxy.types';
import type * as NodeHttpTypes from 'node:http';
import type { RequestOptions } from 'node:https';
import type { Duplex } from 'node:stream';

const secretProxyDriverDropped = new Set<string>(SECRET_PROXY.dropHeaders);

export function secretProxyDriverRefuse(
  response: NodeHttpTypes.ServerResponse,
  statusCode: number,
  message: string,
  headers: NodeHttpTypes.OutgoingHttpHeaders = {},
) {
  response.writeHead(statusCode, { ...headers, 'content-type': 'text/plain; charset=utf-8' }).end(`${message}\n`);
}

export function secretProxyDriverRefuseSocket(socket: Duplex, status: string, message: string, headers = '') {
  socket.end(`HTTP/1.1 ${status}\r\ncontent-type: text/plain; charset=utf-8\r\nconnection: close\r\n${headers}\r\n${message}\n`);
}

export function secretProxyDriverTunnel({ socket, head, secureContext }: SecretProxyTypes.SecretProxyTunnelParams) {
  socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

  if (head.length) {
    socket.unshift(head);
  }

  const tlsSocket = new TLSSocket(socket, { isServer: true, secureContext });

  tlsSocket.on('error', () => tlsSocket.destroy());
  socket.once('end', () => socket.destroy());

  return tlsSocket;
}

function secretProxyDriverDecoder(encoding: string): Transform | null {
  return match(encoding)
    .with('gzip', 'x-gzip', () => createGunzip())
    .with('deflate', () => createInflate())
    .with('br', () => createBrotliDecompress())
    .with('zstd', () => createZstdDecompress())
    .otherwise(() => null);
}

function secretProxyDriverKeep(headers: NodeHttpTypes.IncomingHttpHeaders, dropped: readonly string[]) {
  return Object.entries(headers).filter(([name]) => !secretProxyDriverDropped.has(name) && !name.startsWith(':') && !dropped.includes(name));
}

async function secretProxyDriverForms({ source }: SecretProxyTypes.SecretProxyServiceDeps, hostname: string) {
  const rules = (await source.queries.rules()).filter((rule) => secretProxyAllows(rule, hostname));
  const swaps = await Promise.all(rules.map(async ({ name }) => ({ placeholder: secretProxyPlaceholder(name), value: await source.queries.value({ name }) })));

  return secretProxyScrubForms(swaps.flatMap(({ placeholder, value }) => (value ? [{ placeholder, value }] : [])));
}

async function secretProxyDriverResolve(
  deps: SecretProxyTypes.SecretProxyServiceDeps,
  hostname: string,
  port: number,
): Promise<SecretProxyTypes.SecretProxyResolved> {
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  const internal = addresses.find(({ address }) => secretProxyIsInternal(deps, address, port));
  const first = addresses[0]?.address;

  if (internal) {
    const shown = internal.address === hostname ? hostname : `${hostname} (${internal.address})`;

    return { address: null, statusCode: 403, message: `The proxy does not connect to ${shown}: bots cannot reach internal addresses.` };
  }

  return first ? { address: first } : { address: null, statusCode: 502, message: `The proxy could not resolve ${hostname}.` };
}

function secretProxyDriverPace(socket: Duplex | null) {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (socket?.writableNeedDrain) {
        socket.once('drain', () => callback(null, chunk));
      } else {
        callback(null, chunk);
      }
    },
  });
}

async function secretProxyDriverRespond({ upstreamResponse, response, forms, hasBody, pace }: SecretProxyTypes.SecretProxyRespondParams) {
  const statusCode = upstreamResponse.statusCode ?? 502;

  const encodings = [upstreamResponse.headers['content-encoding'], upstreamResponse.headers['transfer-encoding']].join(',').split(',')
    .map((encoding) => encoding.trim().toLowerCase())
    .filter((encoding) => encoding && encoding !== 'identity' && encoding !== 'chunked');

  const isScrubbed = forms.length > 0 && hasBody && statusCode !== 204 && statusCode !== 304;
  const decoders = isScrubbed ? [...encodings].reverse().map(secretProxyDriverDecoder) : [];
  const secretProxyDriverScrub = (text: string) => secretProxyScrubText(forms, text);
  const lowered = forms.map((form) => ({ ...form, match: Buffer.from(form.match.toString('latin1').toLowerCase(), 'latin1') }));

  const secretProxyDriverScrubHeaders = (headers: NodeHttpTypes.IncomingHttpHeaders, dropped: readonly string[]) => Object.fromEntries(
    secretProxyDriverKeep(headers, dropped).map(([name, value]) => [
      secretProxyScrubText(lowered, name),
      Array.isArray(value) ? value.map(secretProxyDriverScrub) : secretProxyDriverScrub(value ?? ''),
    ]),
  );

  if (decoders.includes(null)) {
    upstreamResponse.destroy();
    secretProxyDriverRefuse(response, 502, `The proxy cannot check a response encoded as ${encodings.join(', ')} for secrets, so it does not pass it on. Ask for gzip, br, deflate, zstd or no encoding.`);

    return;
  }

  const headers = secretProxyDriverScrubHeaders(upstreamResponse.headers, isScrubbed ? ['content-encoding', 'content-length'] : []);

  response.writeHead(statusCode, secretProxyDriverScrub(upstreamResponse.statusMessage ?? ''), headers);

  await (isScrubbed
    ? pipeline(upstreamResponse, ...decoders.filter((decoder) => decoder !== null), secretProxyScrubStream(forms), secretProxyDriverPace(pace), response)
    : pipeline(upstreamResponse, secretProxyDriverPace(pace), response));
}

export async function secretProxyDriverForward(
  deps: SecretProxyTypes.SecretProxyServiceDeps,
  { request, response, target, headers: swapped, pace }: SecretProxyTypes.SecretProxyForwardParams,
) {
  const hostname = target.hostname.replace(/^\[(.*)\]$/u, '$1');
  const isHttps = target.protocol === 'https:';
  const port = Number(target.port || (isHttps ? 443 : 80));

  const resolved = await secretProxyDriverResolve(deps, hostname, port)
    .catch((): SecretProxyTypes.SecretProxyResolved => ({ address: null, statusCode: 502, message: `The proxy could not resolve ${hostname}.` }));

  if (resolved.address === null) {
    secretProxyDriverRefuse(response, resolved.statusCode, resolved.message);

    return;
  }

  const forms = await secretProxyDriverForms(deps, hostname);
  const kept = secretProxyDriverKeep(swapped, forms.length ? SECRET_PROXY.scrubbedDropHeaders : []);
  const headers: NodeHttpTypes.OutgoingHttpHeaders = { ...Object.fromEntries(kept), host: target.host };

  const options: RequestOptions = {
    host: resolved.address,
    port,
    method: request.method,
    path: `${target.pathname}${target.search}`,
    headers,
  };

  if (isHttps && !isIP(hostname)) {
    options.servername = hostname;
  }

  const upstream = (isHttps ? httpsRequest : httpRequest)(options);

  const secretProxyDriverAbort = (reason: string) => {
    upstream.destroy();

    if (response.headersSent) {
      response.destroy();
    } else {
      secretProxyDriverRefuse(response, 504, `The proxy stopped the request to ${hostname}: ${reason}.`);
    }
  };

  const responseTimer = setTimeout(() => secretProxyDriverAbort('it ran longer than the proxy allows'), SECRET_PROXY.responseMaxMs);

  upstream.setTimeout(SECRET_PROXY.idleTimeoutMs, () => secretProxyDriverAbort(`no data for ${String(SECRET_PROXY.idleTimeoutMs / 1000)} seconds`));
  response.once('close', () => {
    clearTimeout(responseTimer);
    upstream.destroy();
  });
  upstream.on('error', (error) => {
    if (!response.headersSent) {
      secretProxyDriverRefuse(response, 502, `The proxy could not reach ${hostname}: ${error.message}`);
    }
  });
  upstream.once('response', (upstreamResponse) => {
    secretProxyDriverRespond({
      upstreamResponse,
      response,
      forms,
      hasBody: request.method !== 'HEAD',
      pace,
    }).catch(() => response.destroy());
  });

  await pipeline(request, upstream).catch(() => upstream.destroy());
}
