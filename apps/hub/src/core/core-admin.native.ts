import { SERVER_PROTOCOL } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import { adminInput } from '../types/admin.types';
import { userCreateInput, userUpdateInput } from '../types/user.types';
import type * as CoreTypes from '../types/core.types';
import type { z } from 'zod';

const API_PREFIX = '/admin/api/';
const RELAY_PATH = /^[A-Za-z\d]+(?:\/[A-Za-z\d]+)*$/u;
const RELAY_REFUSED = /^pairing(?:\/|$)/iu;
const RELAY_HEADERS = ['content-type', 'accept', SERVER_PROTOCOL.versionHeader];
const RELAY_REPLY_HEADERS = ['content-type', 'content-disposition'];
const NO_STORE = { 'Cache-Control': 'no-store' };

export function coreAdminApi(services: CoreTypes.CoreServices, context: CoreTypes.CoreAdminContext): Promise<Response> {
  const { request, url, identity } = context;
  const segments = url.pathname.slice(API_PREFIX.length).replace(/\/$/u, '').split('/');
  const isRead = request.method === 'GET' || request.method === 'HEAD';
  const by = identity.email;

  if ((!isRead || segments[2] === 'rpc') && !coreAdminIsSameSite(context)) {
    throw new Errors.FORBIDDEN({ internal: 'Admin write without a same-origin Origin and a JSON or Orbs header' });
  }

  return match({ method: request.method, segments })
    .with({ method: 'GET', segments: ['me'] }, async () => Response.json({ email: by }, { headers: NO_STORE }))
    .with({ method: 'GET', segments: ['admins'] }, async () => Response.json({ admins: (await services.admins.queries.list()).map((email) => ({ email })) }, { headers: NO_STORE }))
    .with({ method: 'POST', segments: ['admins'] }, async () => {
      const { email } = await coreAdminBody(request, adminInput);

      return Response.json({ email, access: await services.admins.actions.add({ email, by }) }, { headers: NO_STORE });
    })
    .with({ method: 'DELETE', segments: ['admins', P.string] }, async ({ segments: [, encoded] }) => {
      const { email } = coreAdminValid(adminInput.safeParse({ email: coreAdminDecode(encoded) }));

      return Response.json({ access: await services.admins.actions.remove({ email, by }) }, { headers: NO_STORE });
    })
    .with({ method: 'GET', segments: ['users'] }, async () => Response.json({ users: await services.users.queries.list() }, { headers: NO_STORE }))
    .with({ method: 'POST', segments: ['users', P.string, 'rpc', P.string, ...P.array(P.string)] }, ({ segments: [, id, , ...rest] }) => coreAdminRelay(services, context, { id, procedure: rest.join('/') }))
    .with({ method: P.union('POST', 'PATCH', 'DELETE'), segments: P.union(['users'], ['users', P.string]) }, () => coreAdminUsers(services, context, segments[1]))
    .otherwise(async () => new Response(null, { status: 404, headers: NO_STORE }));
}

function coreAdminUsers(services: CoreTypes.CoreServices, { request, identity }: CoreTypes.CoreAdminContext, id: string | undefined): Promise<Response> {
  const by = identity.email;

  if (!services.provisioner.queries.isConfigured()) {
    return Promise.resolve(Response.json({ error: 'provisioner_not_configured' }, { status: 501, headers: NO_STORE }));
  }

  return match({ method: request.method, id })
    .with({ method: 'POST', id: P.nullish }, async () => {
      const input = await coreAdminBody(request, userCreateInput);

      return Response.json(await services.users.actions.create({ ...input, by }), { headers: NO_STORE });
    })
    .with({ method: 'PATCH', id: P.string }, async ({ id: user }) => {
      const input = await coreAdminBody(request, userUpdateInput);

      return Response.json(await services.users.actions.update({
        ...input,
        id: user,
        by,
      }), { headers: NO_STORE });
    })
    .with({ method: 'DELETE', id: P.string }, async ({ id: user }) => Response.json(await services.users.actions.remove({ id: user, by }), { headers: NO_STORE }))
    .otherwise(async () => new Response(null, { status: 404, headers: NO_STORE }));
}

async function coreAdminRelay(
  services: CoreTypes.CoreServices,
  { request, url, identity }: CoreTypes.CoreAdminContext,
  { id, procedure }: CoreTypes.CoreAdminRelay,
): Promise<Response> {
  if (!RELAY_PATH.test(procedure) || RELAY_REFUSED.test(procedure)) {
    throw new Errors.FORBIDDEN({ internal: `The admin relay refuses /rpc/${procedure}` });
  }

  const user = await services.users.queries.get({ id });

  if (!user) {
    return new Response(null, { status: 404, headers: NO_STORE });
  }

  const headers = new Headers();

  RELAY_HEADERS.forEach((name) => match(request.headers.get(name))
    .with(P.string, (value) => headers.set(name, value))
    .otherwise(() => undefined));

  const relayed = new Request(new URL(`/rpc/${procedure}${url.search}`, url), {
    method: request.method,
    headers,
    body: request.body,
    signal: request.signal,
  });

  const response = await services.daemons.actions.door({ user, request: relayed }).catch((error: unknown) => {
    services.daemons.actions.forget({ user });
    throw new Errors.SERVER_UNREACHABLE({ internal: `The private door of ${user.id} failed the request`, cause: error });
  });

  log.info({
    tag: 'hub',
    message: 'Admin call relayed to a private door',
    by: identity.email,
    user: user.id,
    procedure,
    status: response.status,
  });

  const replyHeaders = new Headers(NO_STORE);

  RELAY_REPLY_HEADERS.forEach((name) => match(response.headers.get(name))
    .with(P.string, (value) => replyHeaders.set(name, value))
    .otherwise(() => undefined));

  return new Response(response.body, { status: response.status, headers: replyHeaders });
}

function coreAdminIsSameSite({ request, publicUrl }: CoreTypes.CoreAdminContext): boolean {
  const isJson = /^application\/json(?:;|$)/iu.test(request.headers.get('content-type') ?? '');

  return request.headers.get('origin') === publicUrl.origin && (isJson || request.headers.has(SERVER_PROTOCOL.versionHeader));
}

function coreAdminDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

async function coreAdminBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  return coreAdminValid(schema.safeParse(await request.json().catch(() => null)));
}

function coreAdminValid<T>(parsed: z.ZodSafeParseResult<T>): T {
  if (!parsed.success) {
    throw new Errors.VALIDATION_ERROR({
      fields: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.') || 'body', { message: issue.message }])),
      internal: 'Invalid admin request body',
    });
  }

  return parsed.data;
}
