import { makeClient } from '@repo/client/client';
import { authPairCode, authRedeemResult, botList, serverHealth } from '@repo/contracts/universal';
import { readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { HUB_FIXTURE, hubFixtureCookie, hubFixtureFakeSocket, hubFixtureOwner, hubFixtureStart } from './support/hub.fixture';
import type { HubFixture } from './support/hub.fixture';
import type { WebSocketOptions } from 'bun';

const { hub, publicOrigin, emails } = HUB_FIXTURE;

const webEcho = z.object({
  web: z.literal(true),
  path: z.string(),
  headers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

interface HubTestDevice {
  token: string;
  serverId: string;
}

interface HubTestFixtures {
  emails: typeof emails;
  fixture: HubFixture;
  tokens: { alice: string; bob: string };
  devices: { alice: HubTestDevice; bob: HubTestDevice; handoff: Response; payload: z.infer<typeof authPairCode> };
}

function hubTestGet(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${hub}${path}`, { headers, redirect: 'manual' });
}

async function hubTestRpc(token: string, path: string, body: object | null, headers: Record<string, string> = {}) {
  const response = await fetch(`${hub}/rpc/${path}`, {
    method: 'POST',
    headers: {
      'cookie': hubFixtureCookie(token),
      'content-type': 'application/json',
      'x-bots-protocol': '1',
      'origin': publicOrigin,
      ...headers,
    },
    body: JSON.stringify({ json: body }),
  });

  return { status: response.status, text: await response.text() };
}

function hubTestSocket(path: string, options: WebSocketOptions = {}): WebSocket {
  return Reflect.construct(WebSocket, [`${hub.replace('http', 'ws')}${path}`, options]);
}

function hubTestOpens(socket: WebSocket): Promise<boolean> {
  return new Promise((done) => {
    socket.addEventListener('open', () => done(true));
    socket.addEventListener('error', () => done(false));
  });
}

function hubTestAuth(device: HubTestDevice, extra: Record<string, string> = {}) {
  return { 'authorization': `Bearer ${device.token}`, 'x-bots-server-id': device.serverId, ...extra };
}

function hubTestConnectionCookie(device: HubTestDevice): string {
  const connection = {
    serverId: device.serverId,
    addresses: [{ url: publicOrigin, kind: 'custom' }],
    deviceId: crypto.randomUUID(),
    token: device.token,
  };

  return `bots.connection=${encodeURIComponent(JSON.stringify(connection))}`;
}

async function hubTestPair(token: string, name: string) {
  const handoff = await hubTestGet('/connect', { 'cookie': hubFixtureCookie(token) });
  const code = new URL(handoff.headers.get('location') ?? '', hub).searchParams.get('code') ?? '';
  const payload = authPairCode.parse(code);
  const redeemed = await hubTestRpc(token, 'pairing/redeem', { pin: payload.pin, name });
  const { json } = z.object({ json: authRedeemResult }).parse(JSON.parse(redeemed.text));

  return { handoff, payload, device: { token: json.token, serverId: json.serverId } };
}

const it = test.extend<HubTestFixtures>({
  emails: [emails, { scope: 'file' }],
  fixture: [async ({ emails: users }, use) => {
    const fixture = await hubFixtureStart({ ...HUB_FIXTURE, emails: users });

    await use(fixture);
    await fixture.stop();
  }, { scope: 'file' }],
  tokens: [async ({ fixture }, use) => {
    await use({ alice: await fixture.mint({ email: 'Alice@Team.Example' }), bob: await fixture.mint({ email: emails.bob }) });
  }, { scope: 'file' }],
  devices: [async ({ tokens }, use) => {
    const alice = await hubTestPair(tokens.alice, 'alice browser');
    const bob = await hubTestPair(tokens.bob, 'bob browser');

    const bot = (name: string) => ({
      name,
      handle: name.toLowerCase(),
      modelProvider: 'anthropic',
      modelId: 'claude-opus-5-5',
      thinkingLevel: 'medium',
    });

    await hubTestRpc(tokens.alice, 'bots/create', bot('Alicebot'), hubTestAuth(alice.device));
    await hubTestRpc(tokens.bob, 'bots/create', bot('Bobbot'), hubTestAuth(bob.device));
    await use({
      alice: alice.device,
      bob: bob.device,
      handoff: alice.handoff,
      payload: alice.payload,
    });
  }, { scope: 'file' }],
});

describe('login verification', () => {
  it.for([
    ['a missing cookie', async () => ({})],
    ['a malformed token', async () => ({ 'cookie': hubFixtureCookie('not-a-token') })],
    ['a token the API does not know', async () => ({ 'cookie': hubFixtureCookie('7|unknown0token') })],
    ['an ended login', async (fixture: HubFixture) => ({ 'cookie': hubFixtureCookie(await fixture.mint({ email: emails.alice, exp: Date.now() / 1000 - 3600 })) })],
    ['an Access JWT, which is no login any more', async () => ({ 'cf-access-jwt-assertion': 'a.b.c', 'cookie': 'CF_Authorization=a.b.c' })],
  ] as const)('rejects %s with an empty 401', async ([, headers], { fixture }) => {
    const response = await hubTestGet('/health', await headers(fixture));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  it('trusts no identity header', async () => {
    const response = await hubTestGet('/health', { 'x-vinci-email': emails.alice, 'cf-access-authenticated-user-email': emails.alice });

    expect(response.status).toBe(401);
  });

  it('answers 403 to a valid identity without a hub user', async ({ fixture }) => {
    const response = await hubTestGet('/health', { 'cookie': hubFixtureCookie(await fixture.mint({ email: 'mallory@team.example' })) });

    expect(response.status).toBe(403);
  });

  it('serves its own health check without identity and nothing else', async ({ fixture }) => {
    expect(fixture.hubData).toBeTruthy();
    expect(await (await hubTestGet('/hub/health')).json()).toEqual({ status: 'ok' });
    expect((await hubTestGet('/hub/whoami')).status).toBe(401);
    expect(await Promise.all(['/connect', '/connect?code=x'].map(async (path) => hubTestGet(path, { accept: 'text/html' }).then(async (page) => [page.status, await page.text()])))).toEqual([[401, ''], [401, '']]);
  });
});

describe('routing by identity', () => {
  it('sends each identity to its own daemon', async ({ fixture, tokens }) => {
    const alice = serverHealth.parse(await (await hubTestGet('/health', { 'cookie': hubFixtureCookie(tokens.alice) })).json());
    const bob = serverHealth.parse(await (await hubTestGet('/health', { 'cookie': hubFixtureCookie(tokens.bob) })).json());

    expect(alice.id).toBe(fixture.serverIds.alice);
    expect(bob.id).toBe(fixture.serverIds.bob);
  });

  it('sends other paths to the web app with the login cookie and without client forwarding headers', async ({ tokens }) => {
    const response = await hubTestGet('/rooms', {
      'cookie': hubFixtureCookie(tokens.alice),
      'x-forwarded-host': 'evil.example',
      'x-forwarded-for': '10.9.9.9',
    });

    const { headers } = webEcho.parse(await response.json());

    expect(headers.cookie).toBe(hubFixtureCookie(tokens.alice));
    expect(headers['x-forwarded-host']).toBe('team.example');
    expect(headers['x-forwarded-proto']).toBe('https');
    expect(headers).not.toHaveProperty('x-forwarded-for');
  });

  it('serves the favicon paths from the web app without identity, cookies or tokens', async ({ tokens }) => {
    const response = await hubTestGet('/img/favicon/site.webmanifest', { cookie: `${hubFixtureCookie(tokens.alice)}; bots.connection=x` });
    const { path, headers } = webEcho.parse(await response.json());

    expect(path).toBe('/img/favicon/site.webmanifest');
    expect(headers).not.toHaveProperty('cookie');
    expect((await hubTestGet('/img/favicon/../../health')).status).toBe(401);
  });

  it.for(['/img/favicon/', '/img/favicon', '/img/favicon/nested/icon.png', '/favicon.ico/x'])('requires identity for %s, which is not an icon file', async (path) => {
    expect((await hubTestGet(path)).status).toBe(401);
  });

  it.for([
    ['an internal absolute URL', `${HUB_FIXTURE.web}/img/favicon/?a=1`, `${publicOrigin}/img/favicon/?a=1`],
    ['a relative URL', '/rooms#top', `${publicOrigin}/rooms#top`],
    ['an external URL', 'https://example.com/x', 'https://example.com/x'],
  ] as const)('rewrites %s in relayed Location, Content-Location and Refresh', async ([, value, expected], { tokens }) => {
    const query = new URLSearchParams({
      'location': value,
      'content-location': value,
      'refresh': `0; url=${value}`,
    });

    const response = await hubTestGet(`/relay?${query}`, { 'cookie': hubFixtureCookie(tokens.alice) });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(expected);
    expect(response.headers.get('content-location')).toBe(expected);
    expect(response.headers.get('refresh')).toBe(`0; url=${expected}`);
  });

  it('refuses a WebSocket upgrade outside the daemon paths', async ({ tokens }) => {
    expect(await hubTestOpens(hubTestSocket('/rooms', { headers: { 'cookie': hubFixtureCookie(tokens.alice) } }))).toBe(false);
  });
});

describe('no client value steers the daemon choice', () => {
  it.for([
    ['a bots.connection cookie naming bob', (fixture: HubFixture) => ({ cookie: hubTestConnectionCookie({ serverId: fixture.serverIds.bob, token: 'x' }) }), '/health'],
    ['x-bots-server-id of bob', (fixture: HubFixture) => ({ 'x-bots-server-id': fixture.serverIds.bob }), '/health'],
    ['a Host of bob', () => ({ host: `127.0.0.1:${HUB_FIXTURE.ports.bob}` }), '/health'],
    ['forwarded identity headers of bob', () => ({ 'x-forwarded-host': `127.0.0.1:${HUB_FIXTURE.ports.bob}`, 'cf-access-authenticated-user-email': emails.bob }), '/health'],
    ['a protocol-relative path', () => ({}), `//127.0.0.1:${HUB_FIXTURE.ports.bob}/health`],
    ['a dot-segment path', () => ({}), '/rpc/../health'],
  ] as const)('keeps alice on her daemon with %s', async ([, headers, path], { fixture, tokens }) => {
    const response = await hubTestGet(path, { 'cookie': hubFixtureCookie(tokens.alice), ...headers(fixture) });

    expect(await response.text()).not.toContain(fixture.serverIds.bob);
  });
});

describe('first-visit pairing', () => {
  it('hands an unpaired browser a code from its own daemon', async ({ fixture, devices }) => {
    expect(devices.handoff.status).toBe(303);
    expect(devices.handoff.headers.get('location')).toMatch(/^\/connect\?code=/u);
    expect(devices.payload.serverId).toBe(fixture.serverIds.alice);
    expect(devices.alice.serverId).toBe(fixture.serverIds.alice);
    expect(devices.bob.serverId).toBe(fixture.serverIds.bob);
  });

  it("leaves /connect to the web app once it has a code or a connection to this user's daemon", async ({ tokens, devices }) => {
    const responses = await Promise.all([
      hubTestGet('/connect?code=abc', { 'cookie': hubFixtureCookie(tokens.alice) }),
      hubTestGet('/connect?reason=revoked', { 'cookie': `${hubFixtureCookie(tokens.alice)}; ${hubTestConnectionCookie(devices.alice)}` }),
    ]);

    const echoes = await Promise.all(responses.map(async (response) => webEcho.parse(await response.json()).path));

    expect(echoes).toEqual(['/connect?code=abc', '/connect?reason=revoked']);
  });

  it('hands a fresh code after revoked or replaced, or with a connection to another daemon', async ({ fixture, tokens, devices }) => {
    const responses = await Promise.all([
      hubTestGet('/connect?reason=revoked', { 'cookie': hubFixtureCookie(tokens.bob) }),
      hubTestGet('/connect?reason=replaced', { 'cookie': `${hubFixtureCookie(tokens.bob)}; ${hubTestConnectionCookie(devices.alice)}` }),
    ]);

    const codes = responses.map((response) => authPairCode.parse(new URL(response.headers.get('location') ?? '', hub).searchParams.get('code') ?? ''));

    expect(responses.map(({ status }) => status)).toEqual([303, 303]);
    expect(codes.map(({ serverId }) => serverId)).toEqual([fixture.serverIds.bob, fixture.serverIds.bob]);
  });

  it('serves each user only their own bots through the paired device', async ({ tokens, devices }) => {
    const response = await hubTestRpc(tokens.alice, 'bots/list', null, hubTestAuth(devices.alice));
    const { json } = z.object({ json: botList }).parse(JSON.parse(response.text));

    expect(json.map(({ handle }) => handle)).toEqual(['alicebot']);
  });

  it("keeps bob's data away from alice's identity even with bob's device token", async ({ tokens, devices }) => {
    const crossed = await hubTestRpc(tokens.alice, 'bots/list', null, hubTestAuth(devices.bob));

    expect(crossed.status).toBe(409);
    expect(crossed.text).not.toContain('bobbot');
  });

  it('passes Origin through, so the daemon refuses a foreign one', async ({ tokens, devices }) => {
    const response = await hubTestRpc(tokens.alice, 'bots/list', null, hubTestAuth(devices.alice, { origin: 'https://evil.example' }));

    expect(response.status).toBe(403);
  });

  it('authenticates /files from the connection cookie like the web proxy did', async ({ tokens, devices }) => {
    const path = `/files/${crypto.randomUUID()}/${crypto.randomUUID()}`;
    const anonymous = await hubTestGet(path, { 'cookie': hubFixtureCookie(tokens.alice) });
    const withCookie = await hubTestGet(path, { 'cookie': `${hubFixtureCookie(tokens.alice)}; ${hubTestConnectionCookie(devices.alice)}` });

    expect([400, 401]).toContain(anonymous.status);
    expect(withCookie.status).toBe(404);
  });

});

describe('WebSocket relay', () => {
  it('carries RPC and a live watch stream to the daemon', async ({ fixture, tokens, devices }) => {
    const client = makeClient({
      serverId: devices.alice.serverId,
      token: () => devices.alice.token,
      url: `${hub}/rpc`,
      connect: () => hubTestSocket('/rpc', { headers: { 'cookie': hubFixtureCookie(tokens.alice), 'origin': publicOrigin } }),
    });

    const info = await client.server.info();
    const [bot] = await client.bots.list();
    const frames: string[] = [];
    const abort = new AbortController();

    const watching = (async () => {
      for await (const frame of await client.conversation.watch({ botId: bot.id }, { signal: abort.signal })) {
        frames.push(JSON.stringify(frame));
      }
    })().catch(() => undefined);

    await client.conversation.submit({
      botId: bot.id,
      requestId: crypto.randomUUID(),
      content: 'hello through the hub',
    });
    await vi.waitFor(() => expect(frames.some((frame) => frame.includes('completed'))).toBe(true), { timeout: 20_000, interval: 100 });
    abort.abort();
    await watching;

    expect(info.id).toBe(fixture.serverIds.alice);
  });

  it('refuses an upgrade without a token', async () => {
    expect(await hubTestOpens(hubTestSocket('/rpc'))).toBe(false);
  });
});

describe('server ID pinning', () => {
  it('pins each daemon on first contact', async ({ fixture, tokens }) => {
    const pins = z.record(z.string(), z.string()).parse(JSON.parse(await readFile(join(fixture.hubData, 'pins.json'), 'utf8')));
    const whoami = await (await hubTestGet('/hub/whoami', { 'cookie': hubFixtureCookie(tokens.alice) })).json();

    expect(pins).toEqual(fixture.serverIds);
    expect(whoami).toMatchObject({
      email: emails.alice,
      user: 'alice',
      serverId: fixture.serverIds.alice,
    });
  });

  it("refuses to forward when alice's address answers as another daemon", async ({ fixture, tokens }) => {
    await fixture.writeUsers({ ...fixture.users, [emails.alice]: { ...fixture.users[emails.alice], daemonUrl: `http://localhost:${HUB_FIXTURE.ports.bob}` } });

    const health = await hubTestGet('/health', { 'cookie': hubFixtureCookie(tokens.alice) });
    const bob = serverHealth.parse(await (await hubTestGet('/health', { 'cookie': hubFixtureCookie(tokens.bob) })).json());

    expect(health.status).toBe(502);
    expect(await health.text()).not.toContain(fixture.serverIds.bob);
    expect(bob.id).toBe(fixture.serverIds.bob);

    await fixture.writeUsers(fixture.users);
  });

  it('refuses to pin a daemon that is already pinned to another user', async ({ fixture }) => {
    const carol = await fixture.mint({ email: 'carol@team.example' });

    await fixture.writeUsers({ ...fixture.users, 'carol@team.example': { id: 'carol', daemonUrl: `http://localhost:${HUB_FIXTURE.ports.bob}`, socketPath: join(fixture.root, 'carol.sock') } });

    const health = await hubTestGet('/health', { 'cookie': hubFixtureCookie(carol) });
    const pins = z.record(z.string(), z.string()).parse(JSON.parse(await readFile(join(fixture.hubData, 'pins.json'), 'utf8')));

    expect(health.status).toBe(502);
    expect(pins).not.toHaveProperty('carol');

    await fixture.writeUsers(fixture.users);
  });
});

describe('owner socket', () => {
  it('serves only allowlisted procedures to the owner without a device', async ({ fixture }) => {
    const owner = (path: string, headers = {}) => hubFixtureOwner(fixture.users[emails.alice].socketPath, path, headers);
    const allowed = ['server/info', 'bots/list', 'tools/settings'].map((path) => owner(path));
    const refused = ['conversation/submit', 'conversation/markRead', 'tools/answer', 'pairing/redeem'].map((path) => owner(path)).concat(owner('bots/list', { origin: publicOrigin }));

    expect(await Promise.all(allowed)).toEqual([200, 200, 200]);
    expect(await Promise.all(refused)).toEqual([403, 403, 403, 403, 403]);
  });

  it.for([
    ['a symlink to another socket', (root: string) => ({ link: join(root, 'alice-link.sock'), target: join(root, 'fake/rpc.sock'), socketPath: join(root, 'alice-link.sock') })],
    ['a path through a symlinked folder', (root: string) => ({ link: join(root, 'linked'), target: join(root, 'fake'), socketPath: join(root, 'linked/rpc.sock') })],
  ] as const)('refuses %s and never connects to it', async ([, paths], { fixture, tokens }) => {
    const { link, target, socketPath } = paths(fixture.root);
    const fake = await hubFixtureFakeSocket(join(fixture.root, 'fake/rpc.sock'));

    await symlink(target, link);
    await fixture.writeUsers({ ...fixture.users, [emails.alice]: { ...fixture.users[emails.alice], socketPath } });

    const response = await hubTestGet('/hub/pair', { 'cookie': hubFixtureCookie(tokens.alice) });

    await fixture.writeUsers(fixture.users);
    await fake.close();
    await rm(link);

    expect(response.status).toBe(502);
    expect(fake.requests).toEqual([]);
  });
});

describe('users file', () => {
  it.for([
    ['a duplicate daemonUrl', (fixture: HubFixture) => ({ ...fixture.users, 'carol@team.example': { ...fixture.users[emails.bob], id: 'carol', socketPath: join(fixture.root, 'carol.sock') } })],
    ['a duplicate socketPath', (fixture: HubFixture) => ({ ...fixture.users, 'carol@team.example': { ...fixture.users[emails.bob], id: 'carol', daemonUrl: `http://localhost:${HUB_FIXTURE.ports.bob}` } })],
    ['no file at all', () => null],
  ] as const)('refuses everyone with %s and recovers once fixed', async ([, users], { fixture, tokens }) => {
    await fixture.writeUsers(users(fixture));

    const refused = await hubTestGet('/health', { 'cookie': hubFixtureCookie(tokens.alice) });

    await fixture.writeUsers(fixture.users);

    const restored = await hubTestGet('/health', { 'cookie': hubFixtureCookie(tokens.alice) });

    expect(refused.status).toBe(403);
    expect(restored.status).toBe(200);
  });

  it('closes an open WebSocket once its user is removed', async ({ fixture, tokens }) => {
    const socket = hubTestSocket('/rpc', { headers: { 'cookie': hubFixtureCookie(tokens.alice), 'origin': publicOrigin } });

    const closed = new Promise<number>((done) => {
      socket.addEventListener('close', (event) => done(event.code));
    });

    expect(await hubTestOpens(socket)).toBe(true);

    await fixture.writeUsers({ [emails.bob]: fixture.users[emails.bob] });

    const code = await closed;

    await fixture.writeUsers(fixture.users);

    expect(code).toBe(1008);
  });

  it('closes an open WebSocket once its login ends', async ({ fixture }) => {
    const token = await fixture.mint({ email: emails.alice });
    const socket = hubTestSocket('/rpc', { headers: { 'cookie': hubFixtureCookie(token), 'origin': publicOrigin } });

    const closed = new Promise<number>((done) => {
      socket.addEventListener('close', (event) => done(event.code));
    });

    expect(await hubTestOpens(socket)).toBe(true);
    fixture.revoke(token);
    expect(await closed).toBe(1008);
  });
});

describe('path hygiene', () => {
  it.for(['//rpc/x', '/rpc//x', '//health', '/rooms//x'])('rejects %s with 400 before routing', async (path, { tokens }) => {
    const response = await hubTestGet(path, { 'cookie': hubFixtureCookie(tokens.alice) });

    expect(response.status).toBe(400);
  });
});

describe('grant limit', () => {
  it('limits grants per identity without affecting other users', async ({ tokens, devices }) => {
    expect(devices.alice.token).toBeTruthy();

    const responses = await Promise.all(Array.from({ length: 6 }, () => hubTestGet('/hub/pair', { 'cookie': hubFixtureCookie(tokens.alice) })));
    const bob = await hubTestGet('/hub/pair', { 'cookie': hubFixtureCookie(tokens.bob) });
    const statuses = responses.map(({ status }) => status);

    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
    expect(statuses.every((status) => status === 303 || status === 429)).toBe(true);
    expect(bob.status).toBe(303);
  });
});
