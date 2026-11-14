import type { SecretSource } from './secret.types';
import type { X509Certificate } from '@peculiar/x509';
import type * as NodeHttpTypes from 'node:http';
import type { BlockList, Server as NetServer } from 'node:net';
import type { Duplex } from 'node:stream';
import type { SecureContext } from 'node:tls';

export interface SecretProxyServiceParams {
  source: SecretSource;
  folder: string;
  internalAllow: string[];
  sandboxDir?: string;
}

export interface SecretProxyServiceDeps extends SecretProxyServiceParams {
  state: SecretProxyState;
  internal: BlockList;
}

export interface SecretProxyState {
  token: string;
  server: NodeHttpTypes.Server | null;
  tunnels: NodeHttpTypes.Server | null;
  port: number;
  bridge: NetServer | null;
  starting: Promise<void> | null;
}

export interface SecretProxyCertAuthority {
  caCert: X509Certificate;
  caKey: CryptoKey;
  leafPublicKey: CryptoKey;
  leafKey: string;
  contexts: Map<string, SecureContext>;
}

export interface SecretProxySwap {
  placeholder: string;
  value: string;
}

export interface SecretProxyScrubForm {
  match: Buffer;
  replacement: Buffer;
}

export interface SecretProxyExchange {
  request: NodeHttpTypes.IncomingMessage;
  response: NodeHttpTypes.ServerResponse;
}

export interface SecretProxyTunnel {
  origin: string;
  socket: Duplex;
}

export interface SecretProxySwapParams {
  request: NodeHttpTypes.IncomingMessage;
  target: URL;
}

export type SecretProxySwapped = { refusal: string } | { refusal: null; target: URL; headers: NodeHttpTypes.IncomingHttpHeaders };

export interface SecretProxyForwardParams extends SecretProxyExchange {
  target: URL;
  headers: NodeHttpTypes.IncomingHttpHeaders;
  pace: Duplex | null;
}

export interface SecretProxyTunnelParams {
  socket: Duplex;
  head: Buffer;
  secureContext: SecureContext;
}

export type SecretProxyResolved = { address: string } | { address: null; statusCode: number; message: string };

export interface SecretProxyRespondParams {
  upstreamResponse: NodeHttpTypes.IncomingMessage;
  response: NodeHttpTypes.ServerResponse;
  forms: SecretProxyScrubForm[];
  hasBody: boolean;
  pace: Duplex | null;
}
