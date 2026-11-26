import { match } from 'ts-pattern';
import { z } from 'zod';
import type { HubFixtureConfig } from './hub.fixture';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface HubFixtureCall {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export function hubFixtureProvisioner({ emails, provisionerToken }: HubFixtureConfig) {
  const calls: HubFixtureCall[] = [];

  const userBody = z.object({
    name: z.string(),
    email: z.string(),
    enabled: z.boolean(),
    advanced: z.boolean(),
  });

  const users = new Map(Object.entries(emails).map(([id, email]) => [id, {
    id,
    name: id,
    email,
    enabled: true,
    advanced: false,
    state: 'running',
  }]));

  const handle = (request: IncomingMessage, response: ServerResponse, body: string) => {
    const [, kind = '', id = ''] = (request.url ?? '').split('/');

    calls.push({
      method: request.method ?? '',
      url: request.url ?? '',
      headers: request.headers,
      body,
    });

    if (request.headers.authorization !== `Bearer ${provisionerToken}`) {
      response.writeHead(401).end();
      return;
    }

    match({ method: request.method, kind })
      .with({ method: 'GET', kind: 'users' }, () => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ users: [...users.values()] })))
      .with({ method: 'PUT', kind: 'users' }, () => {
        users.set(id, {
          id,
          ...userBody.parse(JSON.parse(body)),
          state: 'running',
        });
        response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      })
      .with({ method: 'DELETE', kind: 'users' }, () => {
        users.delete(id);
        response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      })
      .with({ method: 'PUT', kind: 'admins' }, () => {
        z.object({ emails: z.array(z.string()) }).parse(JSON.parse(body));
        response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      })
      .otherwise(() => response.writeHead(404).end());
  };

  return { calls, handle };
}
