import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { hubAdminTestKit } from './support/hub-admin.fixture';
import { HUB_ADMIN_FIXTURE, hubFixtureFakeSocket } from './support/hub.fixture';

const { hub, byHand, publicOrigin, emails, admin, provisionerToken } = HUB_ADMIN_FIXTURE;
const { it, get: hubAdminTestGet, read: hubAdminTestRead, write: hubAdminTestWrite } = hubAdminTestKit(HUB_ADMIN_FIXTURE);

const webEcho = z.object({ path: z.string(), headers: z.record(z.string(), z.union([z.string(), z.array(z.string())])) });

describe('admin access', () => {
  it.for([
    ['root', '/admin', 200],
    ['root', '/admin/users/alice', 200],
    ['root', '/assets/app.js', 200],
    ['root', '/admin/api/me', 200],
    ['root', '/health', 403],
    ['root', '/hub/pair', 403],
    ['root', '/connect', 403],
    ['root', '/rooms', 403],
    ['bob', '/admin', 403],
    ['bob', '/admin/api/me', 403],
    ['bob', '/admin/api/users', 403],
    ['bob', '/health', 200],
    ['alice', '/admin', 200],
    ['alice', '/admin/api/me', 200],
    ['alice', '/health', 200],
  ] as const)('gives %s on %s a %i', async ([who, path, status], { tokens }) => {
    expect((await hubAdminTestGet(path, tokens[who])).status).toBe(status);
  });

  it.for(['/admin', '/admin/api/me', '/admin/api/users/alice/rpc/server/info'])('answers 401 without a token on %s', async (path) => {
    expect((await hubAdminTestGet(path)).status).toBe(401);
  });

  it('sends admin pages to the web app with the verified token, and other /admin paths nowhere', async ({ tokens }) => {
    const page = webEcho.parse(await (await hubAdminTestGet('/admin/users?x=1', tokens.root)).json());
    const me = await hubAdminTestRead(tokens.root, '/admin/api/me');
    const unknown = await Promise.all(['/admin/api/nope', '/adminx', '/admin/api'].map((path) => hubAdminTestGet(path, tokens.alice)));

    expect(page.path).toBe('/admin/users?x=1');
    expect(page.headers['cf-access-jwt-assertion']).toBe(tokens.root);
    expect(me.json).toEqual({ email: admin });
    expect(unknown.map(({ status }) => status)).toEqual([404, 404, 404]);
  });

  it.for([
    ['eve', 'eve@team.example', '/', 'No workspace for this email'],
    ['eve', 'eve@team.example', '/admin/users', 'This page is for admins'],
    ['bob', emails.bob, '/admin', 'This page is for admins'],
  ] as const)('shows %s (%s) on %s a page that says %s', async ([who, email, path, title], { tokens }) => {
    const page = await hubAdminTestGet(path, tokens[who], { accept: 'text/html,application/xhtml+xml' });
    const api = await hubAdminTestGet(path, tokens[who]);
    const html = await page.text();

    expect(page.status).toBe(403);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).toContain(`<b>${email}</b>`);
    expect(api.status).toBe(403);
    expect(await api.text()).toBe('');
  });

  it('sends an admin who is not a user from a workspace page to the admin panel', async ({ tokens }) => {
    const page = await hubAdminTestGet('/rooms', tokens.root, { accept: 'text/html' });
    const api = await hubAdminTestGet('/rooms', tokens.root);

    expect(page.status).toBe(303);
    expect(page.headers.get('location')).toBe('/admin');
    expect(api.status).toBe(403);
  });

  it('refuses an admin write without a same-origin Origin and a JSON or Orbs header', async ({ tokens }) => {
    const cases: Record<string, string>[] = [{ origin: '' }, { origin: 'https://evil.example' }, { 'content-type': 'text/plain' }];
    const responses = await Promise.all(cases.map((headers) => hubAdminTestWrite(tokens.root, '/admin/api/admins', { body: { email: 'mallory@team.example' }, headers })));

    const { json } = await hubAdminTestRead(tokens.root, '/admin/api/admins');

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403]);
    expect(JSON.stringify(json)).not.toContain('mallory');
  });
});

describe('admin list', () => {
  it('sends its admin list to the provisioner at start, so Access and the hub agree', async ({ fixture }) => {
    const first = fixture.provisioner.find((call) => call.url === '/access/admins');

    expect(first).toMatchObject({ method: 'PUT', body: JSON.stringify({ emails: [admin, emails.alice] }) });
  });

  it('adds and removes admins, syncs Access through the provisioner and keeps the last admin', async ({ fixture, tokens }) => {
    const added = await hubAdminTestWrite(tokens.root, '/admin/api/admins', { body: { email: 'Carol@Team.Example' } });
    const listed = await hubAdminTestRead(tokens.root, '/admin/api/admins');
    const sync = fixture.provisioner.filter((call) => call.url === '/access/admins').at(-1);
    const invalid = await hubAdminTestWrite(tokens.root, '/admin/api/admins', { body: { email: 'not-an-email' } });
    const remove = (email: string) => hubAdminTestWrite(tokens.root, `/admin/api/admins/${encodeURIComponent(email)}`, { method: 'DELETE' });
    const removals = [await remove('carol@team.example'), await remove(emails.alice), await remove(admin)];
    const stored = JSON.parse(await readFile(join(fixture.hubData, 'admins.json'), 'utf8'));
    const restored = await hubAdminTestWrite(tokens.root, '/admin/api/admins', { body: { email: emails.alice } });

    expect(added.json).toEqual({ email: 'carol@team.example', access: 'synced' });
    expect(listed.json).toEqual({
      admins: [
        { email: admin, access: 'allowed' },
        { email: emails.alice, access: 'allowed' },
        { email: 'carol@team.example', access: 'allowed' },
      ],
    });
    expect(sync?.headers.authorization).toBe(`Bearer ${provisionerToken}`);
    expect(JSON.parse(sync?.body ?? '')).toEqual({ emails: [admin, emails.alice, 'carol@team.example'] });
    expect(invalid.status).toBe(422);
    expect(removals.map(({ status }) => status)).toEqual([200, 200, 409]);
    expect(stored).toEqual({ admins: [admin] });
    expect(restored.status).toBe(200);
  });

  it('fails closed on a malformed admins.json and recovers once fixed', async ({ fixture, tokens }) => {
    const path = join(fixture.hubData, 'admins.json');
    const good = await readFile(path, 'utf8');

    await writeFile(path, '{"admins": "everyone"}');
    await sleep(1500);

    const refused = await hubAdminTestGet('/admin/api/me', tokens.root);

    await writeFile(path, good);
    await sleep(1500);

    expect(refused.status).toBe(403);
    expect((await hubAdminTestGet('/admin/api/me', tokens.root)).status).toBe(200);
  });
});

describe('admin users', () => {
  it('lists, creates, updates and removes users through the provisioner', async ({ fixture, tokens }) => {
    const create = (name: string, email: string) => hubAdminTestWrite(tokens.root, '/admin/api/users', { body: { name, email } });
    const listed = await hubAdminTestRead(tokens.root, '/admin/api/users');
    const carol = await create('Carol Doe', 'carol@team.example');
    const second = await create('Alice', 'alice2@team.example');
    const duplicate = await create('Carol', 'carol@team.example');
    const updated = await hubAdminTestWrite(tokens.root, '/admin/api/users/carol-doe', { method: 'PATCH', body: { enabled: false } });
    const put = fixture.provisioner.filter((call) => call.method === 'PUT' && call.url === '/users/carol-doe').at(-1);
    const removed = await hubAdminTestWrite(tokens.root, '/admin/api/users/carol-doe', { method: 'DELETE' });

    await hubAdminTestWrite(tokens.root, '/admin/api/users/alice-2', { method: 'DELETE' });

    expect(listed.json).toEqual({
      users: [
        {
          id: 'alice',
          name: 'alice',
          email: emails.alice,
          enabled: true,
          state: 'running',
          access: 'allowed',
        },
        {
          id: 'bob',
          name: 'bob',
          email: emails.bob,
          enabled: true,
          state: 'running',
          access: 'allowed',
        },
      ],
      accessMode: 'emails',
    });
    expect(carol.json).toEqual({
      id: 'carol-doe',
      name: 'Carol Doe',
      email: 'carol@team.example',
      enabled: true,
      state: 'running',
      access: 'synced',
      bots: [],
    });
    expect(second.json).toMatchObject({ id: 'alice-2' });
    expect(duplicate.status).toBe(409);
    expect(updated.json).toMatchObject({
      id: 'carol-doe',
      enabled: false,
      access: 'synced',
    });
    expect(JSON.parse(put?.body ?? '')).toEqual({
      name: 'Carol Doe',
      email: 'carol@team.example',
      enabled: false,
    });
    expect(removed.json).toEqual({ access: 'synced' });
    expect(fixture.provisioner.some((call) => call.method === 'DELETE' && call.url === '/users/carol-doe')).toBe(true);
  });

  it('answers 501 to user changes without a provisioner and lists users.json instead', async ({ tokens }) => {
    const created = await hubAdminTestWrite(tokens.root, '/admin/api/users', { body: { name: 'Carol', email: 'carol@team.example' }, base: byHand });
    const listed = await hubAdminTestRead(tokens.root, '/admin/api/users', byHand);

    const added = await hubAdminTestWrite(tokens.root, '/admin/api/admins', { body: { email: 'carol@team.example' }, base: byHand });

    expect(created.status).toBe(501);
    expect(created.json).toEqual({ error: 'provisioner_not_configured' });
    expect(listed.json).toMatchObject({
      users: [
        { id: 'alice', email: emails.alice, state: 'unknown', access: 'unknown' },
        { id: 'bob', email: emails.bob, state: 'unknown', access: 'unknown' },
      ],
      accessMode: 'unknown',
    });
    expect(added.json).toEqual({ email: 'carol@team.example', access: 'manual' });
  });
});

describe('Cloudflare Access state', () => {
  it('shows whom the allow policy lets in, by domain, by email or unknown, and reads it again after a change', async ({ fixture, tokens }) => {
    const outsider = 'dave@outside.example';
    const toggle = (method: 'POST' | 'DELETE') => hubAdminTestWrite(tokens.root, method === 'POST' ? '/admin/api/admins' : `/admin/api/admins/${encodeURIComponent(outsider)}`, { method, body: method === 'POST' ? { email: outsider } : undefined });
    const users = async () => (await hubAdminTestRead(tokens.root, '/admin/api/users')).json;
    const admins = async () => (await hubAdminTestRead(tokens.root, '/admin/api/admins')).json;

    fixture.access.domains = ['team.example'];
    await toggle('POST');

    const byDomain = { users: await users(), admins: await admins() };

    fixture.access.domains = [];
    fixture.access.missing = [emails.bob];
    await toggle('DELETE');

    const cached = await users();

    fixture.access.isDown = true;
    await toggle('POST');

    const down = { users: await users(), admins: await admins() };

    fixture.access.isDown = false;
    fixture.access.missing = [];
    await toggle('DELETE');

    expect(byDomain.users).toMatchObject({
      users: [{ id: 'alice', access: 'allowed' }, { id: 'bob', access: 'allowed' }],
      accessMode: 'domain',
      accessDomains: ['team.example'],
    });
    expect(byDomain.admins).toEqual({ admins: [{ email: admin, access: 'allowed' }, { email: emails.alice, access: 'allowed' }, { email: outsider, access: 'allowed' }] });
    expect(cached).toMatchObject({ users: [{ id: 'alice', access: 'allowed' }, { id: 'bob', access: 'not-allowed' }], accessMode: 'emails' });
    expect(cached).not.toHaveProperty('accessDomains');
    expect(down.users).toMatchObject({ users: [{ id: 'alice', access: 'unknown' }, { id: 'bob', access: 'unknown' }], accessMode: 'unknown' });
    expect(down.admins).toMatchObject({ admins: [{ access: 'unknown' }, { access: 'unknown' }, { access: 'unknown' }] });
  });
});

describe('admin relay to the private door', () => {
  it('forwards only RPC to the owner socket, pinned and without the caller identity', async ({ fixture, tokens }) => {
    const socketPath = join(fixture.root, 'door/rpc.sock');
    const fake = await hubFixtureFakeSocket(socketPath);

    await fixture.writeUsers({ ...fixture.users, [emails.alice]: { ...fixture.users[emails.alice], socketPath } });

    const relay = (path: string, headers: Record<string, string> = {}, token = tokens.root) => hubAdminTestWrite(token, `/admin/api/users/${path}`, {
      body: { json: { probe: true } },
      headers: {
        'cookie': `CF_Authorization=${tokens.root}; bots.connection=x`,
        'authorization': 'Bearer device-token',
        'x-bots-protocol': '1',
        'x-bots-server-id': fixture.serverIds.bob,
        ...headers,
      },
    });

    const relayed = await relay('alice/rpc/server/info');

    const refused = await Promise.all([
      relay('alice/rpc/pairing/bootstrap'),
      relay('alice/rpc/Pairing/bootstrap'),
      relay('alice/rpc/pairing%2Fbootstrap'),
      relay('alice/rpc/server/info', { origin: 'https://evil.example' }),
      relay('alice/rpc/server/info', {}, tokens.bob),
    ]);

    const missing = await relay('nobody/rpc/server/info');

    await fixture.writeUsers(fixture.users);
    await fake.close();

    const [call] = fake.requests;
    const leaked = ['origin', 'cookie', 'authorization', 'cf-access-jwt-assertion', 'x-forwarded-host'].filter((name) => name in call.headers);

    expect(relayed).toEqual({ status: 200, json: { json: { relayed: true } } });
    expect(refused.map(({ status }) => status)).toEqual([403, 403, 403, 403, 403]);
    expect(missing.status).toBe(404);
    expect(fake.requests).toHaveLength(1);
    expect(call.url).toBe('/rpc/server/info');
    expect(call.body).toBe(JSON.stringify({ json: { probe: true } }));
    expect(call.headers['x-bots-server-id']).toBe(fixture.serverIds.alice);
    expect(call.headers['x-bots-protocol']).toBe('1');
    expect(leaked).toEqual([]);
  });

  it('completes onboarding with the first-visit grant, so a provisioned person is never asked to configure anything', async ({ tokens }) => {
    const state = () => hubAdminTestWrite(tokens.root, '/admin/api/users/bob/rpc/onboarding/state', { headers: { 'x-bots-protocol': '1' } });
    const before = await state();
    const handoff = await hubAdminTestGet('/connect', tokens.bob);
    const after = await state();

    expect(before.json).toEqual({ json: { completedAt: null } });
    expect(handoff.status).toBe(303);
    expect(after.json).toEqual({ json: { completedAt: expect.any(Number) } });
  });

  it("serves a user's bot avatars to admins only, from that user's own daemon", async ({ tokens }) => {
    const created = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/rpc/bots/create', {
      body: { json: { name: 'Avatarbot', handle: 'avatarbot', modelProvider: 'anthropic', modelId: 'claude-opus-5-5', thinkingLevel: 'medium' } },
      headers: { 'x-bots-protocol': '1' },
    });

    const { id } = z.object({ json: z.object({ id: z.uuid() }) }).parse(created.json).json;
    const avatar = (path: string, token = tokens.root) => hubAdminTestGet(`/admin/api/users/${path}`, token);

    const own = await avatar(`alice/avatars/bots/${id}.png`);

    const refused = await Promise.all([
      avatar(`alice/avatars/bots/${id}.png`, tokens.bob),
      avatar(`bob/avatars/bots/${id}.png`),
      avatar(`nobody/avatars/bots/${id}.png`),
      avatar('alice/avatars/health'),
      avatar(`alice/avatars/${id}.svg`),
    ]);

    expect(own.status).toBe(200);
    expect(own.headers.get('content-type')).toBe('image/png');
    expect(own.headers.get('cache-control')).toBe('private, no-store');
    expect(refused.map(({ status }) => status)).toEqual([403, 404, 404, 404, 404]);
  });

  it("reaches the user's real owner socket for the forms and refuses conversations, approvals and pairing", async ({ fixture, tokens }) => {
    const call = (procedure: string, user = 'alice') => hubAdminTestWrite(tokens.root, `/admin/api/users/${user}/rpc/${procedure}`, { body: { json: null }, headers: { 'x-bots-protocol': '1' } });

    // The panel's RPC client sends calls without input with no body and no Content-Type, only X-Bots-Protocol.
    const bots = await fetch(`${hub}/admin/api/users/alice/rpc/bots/list`, {
      method: 'POST',
      headers: { 'cf-access-jwt-assertion': tokens.root, 'origin': publicOrigin, 'x-bots-protocol': '1' },
    });

    const info = await call('server/info');

    const refused = await Promise.all([
      'pairing/bootstrap',
      'pairing/create',
      'conversation/submit',
      'conversation/list',
      'conversation/history',
      'tools/answer',
      'tools/pending',
      'routines/create',
      'routines/run',
      'routines/remove',
      'todos/create',
      'todos/update',
    ].map((procedure) => call(procedure)));

    const readOnly = await Promise.all(['routines/list', 'todos/list'].map((procedure) => hubAdminTestWrite(tokens.root, `/admin/api/users/alice/rpc/${procedure}`, {
      body: { json: { botId: 'none' } },
      headers: { 'x-bots-protocol': '1' },
    })));

    const asGet = await fetch(`${hub}/admin/api/users/alice/rpc/server/info`, { headers: { 'cf-access-jwt-assertion': tokens.root, 'origin': publicOrigin, 'x-bots-protocol': '1' } });

    const { alice, bob } = { alice: fixture.users[emails.alice], bob: fixture.users[emails.bob] };

    // Swapped sockets: the hub sends alice's pinned server ID to bob's daemon, which refuses it.
    await fixture.writeUsers({
      ...fixture.users,
      [emails.alice]: { ...alice, socketPath: bob.socketPath },
      [emails.bob]: { ...bob, socketPath: alice.socketPath },
    });

    const swapped = await call('server/info');

    await fixture.writeUsers(fixture.users);

    expect(bots.status).toBe(200);
    expect(info.status).toBe(200);
    expect(JSON.stringify(info.json)).toContain(fixture.serverIds.alice);
    expect(refused.map(({ status }) => status)).toEqual(Array.from({ length: 12 }, () => 403));
    expect(readOnly.map(({ status }) => status)).not.toContain(403);
    expect(asGet.status).toBe(404);
    expect(swapped.status).toBe(409);
  });
});
