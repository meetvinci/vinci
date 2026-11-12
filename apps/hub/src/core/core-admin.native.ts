import { adminSectionId, adminTemplateId, SERVER_PROTOCOL } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import { provisionerAccessMode, provisionerAccessOf } from '../services/provisioner/provisioner.utils';
import { adminInput } from '../types/admin.types';
import { globalBotsInput, globalModeInput, globalSyncInput } from '../types/global.types';
import { userCreateInput, userUpdateInput } from '../types/user.types';
import type * as CoreTypes from '../types/core.types';
import type { z } from 'zod';

const API_PREFIX = '/admin/api/';
const RELAY_PATH = /^[A-Za-z\d]+(?:\/[A-Za-z\d]+)*$/u;
const RELAY_REFUSED = /^(?:pairing(?:\/|$)|providers\/(?:export|import)$|secrets\/export$|tools\/export$|workspace\/|bots\/(?:exportFiles|importFiles)$)/iu;
const AVATAR_FILE = /^(?:bots\/)?[\da-f-]{36}\.(?:png|webp)$/u;
const RELAY_HEADERS = ['content-type', 'accept', SERVER_PROTOCOL.versionHeader];
const RELAY_REPLY_HEADERS = ['content-type', 'content-disposition'];
const AVATAR_REPLY_HEADERS = ['content-type'];
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
    .with({ method: 'GET', segments: ['admins'] }, async () => {
      const [admins, rule] = await Promise.all([
        services.admins.queries.list(),
        services.provisioner.queries.access(),
      ]);

      return Response.json({ admins: admins.map((email) => ({ email, access: provisionerAccessOf({ rule, email }) })) }, { headers: NO_STORE });
    })
    .with({ method: 'POST', segments: ['admins'] }, async () => {
      const { email } = await coreAdminBody(request, adminInput);

      return Response.json({ email, access: await services.admins.actions.add({ email, by }) }, { headers: NO_STORE });
    })
    .with({ method: 'DELETE', segments: ['admins', P.string] }, async ({ segments: [, encoded] }) => {
      const { email } = coreAdminValid(adminInput.safeParse({ email: coreAdminDecode(encoded) }));

      return Response.json({ access: await services.admins.actions.remove({ email, by }) }, { headers: NO_STORE });
    })
    .with({ method: 'GET', segments: ['users'] }, async () => {
      const [users, rule] = await Promise.all([
        services.users.queries.list(),
        services.provisioner.queries.access(),
      ]);

      const accessMode = provisionerAccessMode(rule);

      const body = match(accessMode)
        .with('domain', () => ({ accessDomains: rule.domains }))
        .otherwise(() => ({}));

      return Response.json({
        users: users.map((user) => ({ ...user, access: provisionerAccessOf({ rule, email: user.email }) })),
        accessMode,
        ...body,
      }, { headers: NO_STORE });
    })
    .with({ method: 'GET', segments: ['users', P.string, 'avatars', P.string, ...P.array(P.string)] }, ({ segments: [, id, , ...rest] }) => coreAdminAvatar(services, { id, file: rest.join('/') }))
    .with({ method: 'POST', segments: ['users', P.string, 'rpc', P.string, ...P.array(P.string)] }, ({ segments: [, id, , ...rest] }) => coreAdminRelay(services, context, { id, procedure: rest.join('/') }))
    .with({ method: 'GET', segments: ['global'] }, async () => Response.json(await services.global.queries.global(), { headers: NO_STORE }))
    .with({ method: 'GET', segments: ['global', 'status'] }, async () => Response.json({ users: await services.global.queries.status() }, { headers: NO_STORE }))
    .with({ method: 'POST', segments: ['global', 'sync'] }, () => coreAdminGlobal(services, async () => {
      const { section } = await coreAdminBody(request, globalSyncInput);

      return Response.json({ users: await services.global.actions.sync({ section, by }) }, { headers: NO_STORE });
    }))
    .with({ method: 'GET', segments: ['users', P.string, 'sections'] }, async ({ segments: [, id] }) => match(await coreAdminPerson(services, id))
      .with(true, () => Response.json({ sections: services.global.queries.sections({ id }) }, { headers: NO_STORE }))
      .otherwise(() => new Response(null, { status: 404, headers: NO_STORE })))
    .with({ method: 'PUT', segments: ['users', P.string, 'sections', P.string] }, ({ segments: [, id, , encoded] }) => coreAdminGlobal(services, async () => {
      const section = adminSectionId.safeParse(encoded);

      if (!section.success) {
        return new Response(null, { status: 404, headers: NO_STORE });
      }

      const { mode } = await coreAdminBody(request, globalModeInput);

      return Response.json({ sections: [await services.global.actions.mode({
        id,
        section: section.data,
        mode,
        by,
      })] }, { headers: NO_STORE });
    }))
    .with({ method: 'POST', segments: ['users', P.string, 'bots', 'copy'] }, async ({ segments: [, id] }) => {
      const { bots } = await coreAdminBody(request, globalBotsInput);

      return Response.json({ bots: await services.global.actions.bots({
        id,
        bots,
        by,
      }) }, { headers: NO_STORE });
    })
    .with({ method: P.union('POST', 'PATCH', 'DELETE'), segments: P.union(['users'], ['users', P.string]) }, () => coreAdminUsers(services, context, segments[1]))
    .otherwise(async () => new Response(null, { status: 404, headers: NO_STORE }));
}

function coreAdminUsers(services: CoreTypes.CoreServices, { request, identity }: CoreTypes.CoreAdminContext, id: string | undefined): Promise<Response> {
  const by = identity.email;

  if (!services.provisioner.queries.isConfigured()) {
    return Promise.resolve(Response.json({ error: 'provisioner_not_configured' }, { status: 501, headers: NO_STORE }));
  }

  if (id === adminTemplateId) {
    return Promise.resolve(new Response(null, { status: 404, headers: NO_STORE }));
  }

  return match({ method: request.method, id })
    .with({ method: 'POST', id: P.nullish }, () => coreAdminGlobal(services, async () => {
      const input = await coreAdminBody(request, userCreateInput);

      return Response.json(await services.global.actions.create({ ...input, by }), { headers: NO_STORE });
    }))
    .with({ method: 'PATCH', id: P.string }, async ({ id: user }) => {
      const input = await coreAdminBody(request, userUpdateInput);

      return Response.json(await services.global.actions.update({
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

  const user = await coreAdminTarget(services, id);

  if (!user) {
    return new Response(null, { status: 404, headers: NO_STORE });
  }

  const section = services.global.queries.section({ procedure });

  if (section && user.id !== adminTemplateId && await services.global.queries.isBroken()) {
    return Response.json({ error: 'global_state_unreadable' }, { status: 503, headers: NO_STORE });
  }

  const follows = user.id === adminTemplateId ? null : services.global.queries.guard({ id: user.id, procedure });

  if (follows) {
    return Response.json({ code: 'SECTION_FOLLOWS_GLOBAL', section: follows }, { status: 409, headers: NO_STORE });
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

  if (user.id === adminTemplateId && response.ok) {
    services.global.actions.changed({ procedure, by: identity.email });
  }

  const replyHeaders = new Headers(NO_STORE);

  RELAY_REPLY_HEADERS.forEach((name) => match(response.headers.get(name))
    .with(P.string, (value) => replyHeaders.set(name, value))
    .otherwise(() => undefined));

  return new Response(response.body, { status: response.status, headers: replyHeaders });
}

async function coreAdminGlobal(services: CoreTypes.CoreServices, run: () => Promise<Response>): Promise<Response> {
  return await services.global.queries.isBroken()
    ? Response.json({ error: 'global_state_unreadable' }, { status: 503, headers: NO_STORE })
    : run();
}

function coreAdminTarget(services: CoreTypes.CoreServices, id: string) {
  return id === adminTemplateId ? services.users.queries.template() : services.users.queries.get({ id });
}

async function coreAdminPerson(services: CoreTypes.CoreServices, id: string): Promise<boolean> {
  return (await services.users.queries.list()).some((user) => user.id === id);
}

async function coreAdminAvatar(services: CoreTypes.CoreServices, { id, file }: CoreTypes.CoreAdminAvatar): Promise<Response> {
  const user = AVATAR_FILE.test(file) ? await coreAdminTarget(services, id) : null;

  if (!user) {
    return new Response(null, { status: 404, headers: NO_STORE });
  }

  const daemon = await services.daemons.actions.resolve({ user });

  const response = await fetch(new URL(`/avatars/${file}`, daemon.url)).catch((error: unknown) => {
    services.daemons.actions.forget({ user });
    throw new Errors.SERVER_UNREACHABLE({ internal: `The daemon of ${user.id} failed an avatar request`, cause: error });
  });

  const headers = new Headers({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });

  AVATAR_REPLY_HEADERS.forEach((name) => match(response.headers.get(name))
    .with(P.string, (value) => headers.set(name, value))
    .otherwise(() => undefined));

  return new Response(response.body, { status: response.status, headers });
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
