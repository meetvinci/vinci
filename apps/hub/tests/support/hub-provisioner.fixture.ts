import { match } from 'ts-pattern';
import { z } from 'zod';
import type { HubFixtureConfig } from './hub.fixture';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface HubFixtureAccess {
  domains: string[];
  missing: string[];
  isDown: boolean;
  admins: string[];
}

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

  const access: HubFixtureAccess = { domains: [], missing: [], isDown: false, admins: [] };

  const accessRule = () => ({
    domains: access.domains,
    emails: [...[...users.values()].filter((user) => user.enabled).map((user) => user.email), ...access.admins]
      .filter((email) => !access.missing.includes(email) && !access.domains.some((domain) => email.endsWith(`@${domain}`))),
  });

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
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access: 'synced' }));
      })
      .with({ method: 'DELETE', kind: 'users' }, () => {
        users.delete(id);
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access: 'synced' }));
      })
      .with({ method: 'PUT', kind: 'access' }, () => {
        access.admins = z.object({ emails: z.array(z.string()) }).parse(JSON.parse(body)).emails;
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access: 'synced' }));
      })
      .with({ method: 'GET', kind: 'access' }, () => (access.isDown
        ? response.writeHead(500).end()
        : response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(accessRule()))))
      .otherwise(() => response.writeHead(404).end());
  };

  return { calls, access, handle };
}
