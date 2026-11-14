import type { SecretSource } from './secret.types';
import type { CompletedRequest, Mockttp } from 'mockttp';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { BlockList, Server as NetServer } from 'node:net';

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
  forwardKey: string;
  server: Mockttp | null;
  forward: Server | null;
  forwardUrl: string;
  bridge: NetServer | null;
  starting: Promise<void> | null;
}

export interface SecretProxySwap {
  placeholder: string;
  value: string;
}

export interface SecretProxyScrubForm {
  match: Buffer;
  replacement: Buffer;
}

export interface SecretProxySwapParams {
  request: CompletedRequest;
}

export interface SecretProxyForwardParams {
  request: IncomingMessage;
  response: ServerResponse;
}

export type SecretProxyResolved = { address: string } | { address: null; statusCode: number; message: string };

export interface SecretProxyRespondParams {
  upstreamResponse: IncomingMessage;
  response: ServerResponse;
  forms: SecretProxyScrubForm[];
  hasBody: boolean;
}
