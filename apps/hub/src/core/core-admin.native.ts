import { adminOutsideInput, adminSectionId, adminTemplateId, attachmentGet, SERVER_PROTOCOL } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import { provisionerAccessMode, provisionerAccessOf } from '../services/provisioner/provisioner.utils';
import { adminEmptyReply, adminInput, adminListBody, adminReadBody, adminWriteBody } from '../types/admin.types';
import { auditListInput } from '../types/audit.types';
import { globalBotsInput, globalModeInput, globalSyncInput } from '../types/global.types';
import { userCreateInput, userUpdateInput } from '../types/user.types';
import { coreAuditChange, coreAuditOutside, coreAuditRecord } from './core-audit.native';
import type * as CoreTypes from '../types/core.types';
import type { UserDaemon } from '../types/user.types';
import type { z } from 'zod';

const API_PREFIX = '/admin/api/';
const RELAY_PATH = /^[A-Za-z\d]+(?:\/[A-Za-z\d]+)*$/u;
const RELAY_REFUSED = /^(?:pairing(?:\/|$)|providers\/(?:export|import)$|secrets\/(?:export|import)$|tools\/export$|workspace\/|bots\/(?:exportFiles|importFiles)$|attachments\/)/iu;
const RELAY_READS = /^(?:conversation\/(?:list|history|search|reactions|questions)|artifacts\/(?:get|versions)|tools\/pending|routines\/list|todos\/list)$/iu;
const RELAY_UNAUDITED = /^(?:conversation\/reactions|artifacts\/versions)$/iu;
const RELAY_WAITING = /^(?:tools\/pending|conversation\/questions)$/iu;
const RELAY_QUIET = /^(?:[A-Za-z]+\/(?:list|get|catalog|settings|discover|shared|local|state|info|status|session)|tools\/alwaysAllowed)$/u;
const RELAY_READ_LIMIT = 64 * 1024;
const AVATAR_FILE = /^(?:bots\/)?[\da-f-]{36}\.(?:png|webp)$/u;
const RELAY_HEADERS = ['content-type', 'accept', SERVER_PROTOCOL.versionHeader];
const RELAY_REPLY_HEADERS = ['content-type', 'content-disposition'];
const AVATAR_REPLY_HEADERS = ['content-type'];
const FILE_REPLY_HEADERS = ['content-type', 'content-disposition', 'content-range', 'accept-ranges'];
const FILE_INLINE = /^(?:image\/(?:png|jpeg|webp|gif)|video\/[\w.+-]+|audio\/[\w.+-]+)(?:;|$)/iu;
const NO_STORE = { 'Cache-Control': 'no-store' };

const FILE_POLICY = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "sandbox; default-src 'none'",
};

export function coreAdminApi(services: CoreTypes.CoreServices, context: CoreTypes.CoreAdminContext): Promise<Response> {
  const { request, url, identity } = context;
  const segments = url.pathname.slice(API_PREFIX.length).replace(/\/$/u, '').split('/');
  const isRead = request.method === 'GET' || request.method === 'HEAD';
  const by = identity.email;

  if ((!isRead || segments[2] === 'rpc') && !coreAdminIsSameSite(context)) {
    throw new Errors.FORBIDDEN({ internal: 'Admin write without a same-origin Origin and a JSON or Vinci header' });
  }

  return match({ method: request.method, segments })
    .with({ method: 'GET', segments: ['me'] }, async () => Response.json({ email: by }, { headers: NO_STORE }))
    .with({ method: 'GET', segments: ['audit'] }, async () => {
      const input = coreAdminValid(auditListInput.safeParse(Object.fromEntries(url.searchParams)));

      return Response.json(services.audit.queries.list(input), { headers: NO_STORE });
    })
    .with({ method: 'GET', segments: ['admins'] }, async () => {
      const [admins, rule] = await Promise.all([
        services.admins.queries.list(),
        services.provisioner.queries.access(),
      ]);

      return Response.json({ admins: admins.map((email) => ({ email, access: provisionerAccessOf({ rule, email }) })) }, { headers: NO_STORE });
    })
    .with({ method: 'POST', segments: ['admins'] }, () => coreAuditChange(services, context, { action: 'admins/add' }, async (change) => {
      const { email } = await coreAdminBody(request, adminInput);

      change.detail = email;

      return Response.json({ email, ...await services.admins.actions.add({ email, by }) }, { headers: NO_STORE });
    }))
    .with({ method: 'DELETE', segments: ['admins', P.string] }, ({ segments: [, encoded] }) => coreAuditChange(services, context, { action: 'admins/remove' }, async (change) => {
      const { email } = coreAdminValid(adminInput.safeParse({ email: coreAdminDecode(encoded) }));

      change.detail = email;

      return Response.json({ access: (await services.admins.actions.remove({ email, by })).access }, { headers: NO_STORE });
    }))
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
        hasAccounts: services.accounts.queries.isConfigured(),
        ...body,
      }, { headers: NO_STORE });
    })
    .with({ method: 'GET', segments: ['users', P.string, 'avatars', P.string, ...P.array(P.string)] }, ({ segments: [, id, , ...rest] }) => coreAdminAvatar(services, { id, file: rest.join('/') }))
    .with({ method: 'GET', segments: ['users', P.string, 'files', P.string, P.string] }, ({ segments: [, id, , botId, attachmentId] }) => coreAdminFile(services, context, {
      id,
      botId,
      attachmentId,
      isPoster: false,
    }))
    .with({ method: 'GET', segments: ['users', P.string, 'files', P.string, P.string, 'poster'] }, ({ segments: [, id, , botId, attachmentId] }) => coreAdminFile(services, context, {
      id,
      botId,
      attachmentId,
      isPoster: true,
    }))
    .with({ method: 'POST', segments: ['users', P.string, 'password'] }, async ({ segments: [, id] }) => Response.json(await services.users.actions.password({ id, by }), { headers: NO_STORE }))
    .with({ method: 'POST', segments: ['users', P.string, 'outside'] }, async ({ segments: [, id] }) => coreAuditOutside(services, context, { target: await coreAdminBody(request, adminOutsideInput), user: await coreAdminTarget(services, id) }))
    .with({ method: 'POST', segments: ['users', P.string, 'rpc', P.string, ...P.array(P.string)] }, ({ segments: [, id, , ...rest] }) => coreAdminRpc(services, context, { id, procedure: rest.join('/') }))
    .with({ method: 'GET', segments: ['global'] }, async () => Response.json(await services.global.queries.global(), { headers: NO_STORE }))
    .with({ method: 'GET', segments: ['global', 'status'] }, async () => Response.json({ users: await services.global.queries.status() }, { headers: NO_STORE }))
    .with({ method: 'POST', segments: ['global', 'sync'] }, () => coreAuditChange(services, context, { action: 'global/sync' }, (change) => coreAdminGlobal(services, async () => {
      const { section } = await coreAdminBody(request, globalSyncInput);

      change.detail = section ?? null;

      return Response.json({ users: await services.global.actions.sync({ section, by }) }, { headers: NO_STORE });
    })))
    .with({ method: 'GET', segments: ['users', P.string, 'sections'] }, async ({ segments: [, id] }) => match(await coreAdminPerson(services, id))
      .with(true, () => Response.json({ sections: services.global.queries.sections({ id }) }, { headers: NO_STORE }))
      .otherwise(() => new Response(null, { status: 404, headers: NO_STORE })))
    .with({ method: 'PUT', segments: ['users', P.string, 'sections', P.string] }, ({ segments: [, id, , encoded] }) => coreAuditChange(services, context, { action: 'sections/mode', userId: id }, (change) => coreAdminGlobal(services, async () => {
      const section = adminSectionId.safeParse(encoded);

      if (!section.success) {
        return new Response(null, { status: 404, headers: NO_STORE });
      }

      const { mode, marker } = await coreAdminBody(request, globalModeInput);

      change.action = `sections/${mode}`;
      change.detail = section.data;

      return Response.json({ sections: [await services.global.actions.mode({
        id,
        section: section.data,
        mode,
        marker,
        by,
      })] }, { headers: NO_STORE });
    })))
    .with({ method: 'GET', segments: ['users', P.string, 'sections', P.string, 'preview'] }, async ({ segments: [, id, , encoded] }) => {
      const section = adminSectionId.safeParse(encoded);

      return section.success && id !== adminTemplateId && await coreAdminPerson(services, id)
        ? Response.json(await services.global.queries.preview({ id, section: section.data }), { headers: NO_STORE })
        : new Response(null, { status: 404, headers: NO_STORE });
    })
    .with({ method: 'POST', segments: ['users', P.string, 'bots', 'copy'] }, ({ segments: [, id] }) => coreAuditChange(services, context, { action: 'bots/copy', userId: id }, async (change) => {
      const { bots } = await coreAdminBody(request, globalBotsInput);

      change.detail = String(bots.length);

      return Response.json({ bots: await services.global.actions.bots({
        id,
        bots,
        by,
      }) }, { headers: NO_STORE });
    }))
    .with({ method: P.union('POST', 'PATCH', 'DELETE'), segments: P.union(['users'], ['users', P.string]) }, ({ method }) => coreAuditChange(services, context, {
      action: match(method)
        .with('POST', () => 'users/create')
        .with('PATCH', () => 'users/update')
        .otherwise(() => 'users/remove'),
      userId: segments[1] ?? null,
    }, (change) => coreAdminUsers(services, context, { id: segments[1], change })))
    .otherwise(async () => new Response(null, { status: 404, headers: NO_STORE }));
}

function coreAdminUsers(
  services: CoreTypes.CoreServices,
  { request, identity }: CoreTypes.CoreAdminContext,
  { id, change }: CoreTypes.CoreAdminUsers,
): Promise<Response> {
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

      change.detail = input.email;

      const created = await services.global.actions.create({ ...input, by });

      change.userId = created.id;

      return Response.json(created, { headers: NO_STORE });
    }))
    .with({ method: 'PATCH', id: P.string }, async ({ id: user }) => {
      const input = await coreAdminBody(request, userUpdateInput);

      change.action = match(input)
        .with({ enabled: true }, () => 'users/enable')
        .with({ enabled: false }, () => 'users/disable')
        .with({ advanced: P.boolean }, () => 'users/advanced')
        .otherwise(() => 'users/update');
      change.detail = match(input.advanced)
        .with(true, () => 'on')
        .with(false, () => 'off')
        .otherwise(() => null);

      return Response.json(await services.global.actions.update({
        ...input,
        id: user,
        by,
      }), { headers: NO_STORE });
    })
    .with({ method: 'DELETE', id: P.string }, async ({ id: user }) => Response.json(await services.users.actions.remove({ id: user, by }), { headers: NO_STORE }))
    .otherwise(async () => new Response(null, { status: 404, headers: NO_STORE }));
}

function coreAdminRpc(services: CoreTypes.CoreServices, context: CoreTypes.CoreAdminContext, { id, procedure }: Omit<CoreTypes.CoreAdminRelay, 'change'>): Promise<Response> {
  if (RELAY_READS.test(procedure) || RELAY_QUIET.test(procedure)) {
    return coreAdminRelay(services, context, {
      id,
      procedure,
      change: null,
    });
  }

  return coreAuditChange(services, context, { action: procedure, userId: id }, (change) => coreAdminRelay(services, context, {
    id,
    procedure,
    change,
  }));
}

async function coreAdminRelay(
  services: CoreTypes.CoreServices,
  { request, url, identity }: CoreTypes.CoreAdminContext,
  { id, procedure, change }: CoreTypes.CoreAdminRelay,
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

  const read = RELAY_READS.test(procedure) ? await coreAdminRead(request, procedure) : null;

  const response = await coreAdminDoor(services, user, new Request(new URL(`/rpc/${procedure}${read ? '' : url.search}`, url), {
    method: request.method,
    headers,
    body: read?.body ?? (change ? await coreAdminWrite(request, change) : request.body),
    signal: request.signal,
  }));

  const reply = read?.isWaiting && response.ok ? await response.text() : null;

  if (read?.isAudited && !coreAdminIsNothingWaiting(reply) && !coreAuditRecord(services, {
    by: identity.email,
    kind: 'read',
    action: procedure,
    userId: user.id,
    botId: read.target?.botId ?? null,
    conversationId: read.target?.conversationId ?? null,
    status: response.status,
  })) {
    await (reply === null ? response.body?.cancel() : undefined);

    return Response.json({ error: 'audit_unavailable' }, { status: 503, headers: NO_STORE });
  }

  if (!read && !change) {
    log.info({
      tag: 'hub',
      message: 'Admin call relayed to a private door',
      by: identity.email,
      user: user.id,
      procedure,
      status: response.status,
    });
  }

  if (user.id === adminTemplateId && response.ok) {
    services.global.actions.changed({ procedure, by: identity.email });
  }

  const replyHeaders = new Headers(NO_STORE);

  RELAY_REPLY_HEADERS.forEach((name) => match(response.headers.get(name))
    .with(P.string, (value) => replyHeaders.set(name, value))
    .otherwise(() => undefined));

  return new Response(reply ?? response.body, { status: response.status, headers: replyHeaders });
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

async function coreAdminFile(
  services: CoreTypes.CoreServices,
  { request, identity }: CoreTypes.CoreAdminContext,
  { id, isPoster, ...target }: CoreTypes.CoreAdminFile,
): Promise<Response> {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new Errors.FORBIDDEN({ internal: 'The admin file route refuses cross-site requests' });
  }

  const input = attachmentGet.safeParse(target);
  const user = input.success ? await coreAdminTarget(services, id) : null;

  if (!input.success || !user) {
    return new Response(null, { status: 404, headers: NO_STORE });
  }

  const procedure = isPoster ? 'attachments/poster' : 'attachments/download';
  const headers = new Headers({ 'content-type': 'application/json', [SERVER_PROTOCOL.versionHeader]: String(SERVER_PROTOCOL.version) });

  match(request.headers.get('range'))
    .with(P.string, (value) => headers.set('range', value))
    .otherwise(() => undefined);

  const response = await coreAdminDoor(services, user, new Request(new URL(`/rpc/${procedure}`, request.url), {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: input.data }),
    signal: request.signal,
  }));

  const served = response.headers.get('content-range');

  if ((served === null || served.startsWith('bytes 0-')) && !coreAuditRecord(services, {
    by: identity.email,
    kind: 'read',
    action: procedure,
    userId: user.id,
    botId: input.data.botId,
    status: response.status,
  })) {
    await response.body?.cancel();

    return new Response(null, { status: 503, headers: NO_STORE });
  }

  if (!response.ok) {
    await response.body?.cancel();
    return new Response(null, { status: response.status, headers: NO_STORE });
  }

  const replyHeaders = new Headers(FILE_POLICY);

  FILE_REPLY_HEADERS.forEach((name) => match(response.headers.get(name))
    .with(P.string, (value) => replyHeaders.set(name, value))
    .otherwise(() => undefined));

  match({ type: replyHeaders.get('content-type') ?? '', disposition: replyHeaders.get('content-disposition') })
    .with({ type: P.when((type) => FILE_INLINE.test(type)) }, () => undefined)
    .with({ disposition: P.string }, ({ disposition }) => replyHeaders.set('content-disposition', disposition.replace(/^\s*inline/iu, 'attachment')))
    .otherwise(() => replyHeaders.set('content-disposition', 'attachment'));

  return match(response.headers.get('content-range'))
    .with(P.nullish, () => new Response(response.body, { status: 200, headers: replyHeaders }))
    .with(P.string.startsWith('bytes */'), async () => {
      await response.body?.cancel();
      replyHeaders.delete('content-type');

      return new Response(null, { status: 416, headers: replyHeaders });
    })
    .otherwise(() => new Response(response.body, { status: 206, headers: replyHeaders }));
}

function coreAdminDoor(services: CoreTypes.CoreServices, user: UserDaemon, request: Request): Promise<Response> {
  return services.daemons.actions.door({ user, request }).catch((error: unknown) => {
    services.daemons.actions.forget({ user });
    throw new Errors.SERVER_UNREACHABLE({ internal: `The private door of ${user.id} failed the request`, cause: error });
  });
}

async function coreAdminWrite(request: Request, change: CoreTypes.CoreAdminChange): Promise<BodyInit | null> {
  const isJson = /^application\/json(?:;|$)/iu.test(request.headers.get('content-type') ?? '');
  const length = Number(request.headers.get('content-length') ?? Number.POSITIVE_INFINITY);

  if (!isJson || length > RELAY_READ_LIMIT) {
    return request.body;
  }

  const body = await request.text();

  change.botId = adminWriteBody.safeParse(body).data?.json.botId ?? null;

  return body;
}

async function coreAdminRead(request: Request, procedure: string): Promise<CoreTypes.CoreAdminRead> {
  const isJson = /^application\/json(?:;|$)/iu.test(request.headers.get('content-type') ?? '');
  const length = Number(request.headers.get('content-length') ?? Number.POSITIVE_INFINITY);
  const body = isJson && length <= RELAY_READ_LIMIT ? await request.text() : '';
  const isList = /^conversation\/list$/iu.test(procedure);
  const target = isList ? null : adminReadBody.safeParse(body).data?.json;

  if (isList ? !adminListBody.safeParse(body).success : !target) {
    throw new Errors.VALIDATION_ERROR({ fields: { body: { message: 'validation_invalid' } }, internal: `The admin relay reads only a JSON target for /rpc/${procedure}` });
  }

  return { body, isAudited: !RELAY_UNAUDITED.test(procedure), isWaiting: RELAY_WAITING.test(procedure), target: target ?? null };
}

function coreAdminIsNothingWaiting(reply: string | null): boolean {
  return reply !== null && adminEmptyReply.safeParse(reply).success;
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
