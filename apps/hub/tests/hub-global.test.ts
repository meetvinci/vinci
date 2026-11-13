import { makeHttpClient } from '@repo/client/client';
import { authPairCode, authRedeemResult } from '@repo/contracts/universal';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { hubAdminTestKit } from './support/hub-admin.fixture';
import { HUB_GLOBAL_FIXTURE } from './support/hub.fixture';

const { it, get: hubAdminTestGet, read: hubAdminTestRead, write: hubAdminTestWrite } = hubAdminTestKit(HUB_GLOBAL_FIXTURE);

describe('global settings and the template workspace', () => {
  const previewItem = z.object({
    kind: z.string(),
    name: z.string(),
    change: z.string(),
  });

  const secret = (name: string, value: string) => ({ name, hosts: ['api.example.com'], value });

  const previewItems = z.object({
    marker: z.string(),
    items: z.array(previewItem),
    isPartial: z.boolean(),
  });

  const relay = (token: string, user: string, procedure: string, input?: object) => hubAdminTestWrite(token, `/admin/api/users/${user}/rpc/${procedure}`, {
    body: { json: input ?? null },
    headers: { 'x-bots-protocol': '1' },
  });

  async function hubAdminTestUntil(check: () => Promise<boolean>, deadline = Date.now() + 15_000): Promise<boolean> {
    if (await check()) {
      return true;
    }

    if (Date.now() > deadline) {
      return false;
    }

    await sleep(250);

    return hubAdminTestUntil(check, deadline);
  }

  async function hubAdminTestBack(token: string, user: string, section: string) {
    const { json } = await hubAdminTestRead(token, `/admin/api/users/${user}/sections/${section}/preview`);
    const { marker } = z.object({ marker: z.string() }).parse(json);

    return hubAdminTestWrite(token, `/admin/api/users/${user}/sections/${section}`, { method: 'PUT', body: { mode: 'global', marker } });
  }

  it('keeps the template out of the user list and every login, and relays to it for admins only', async ({ tokens }) => {
    const users = await hubAdminTestRead(tokens.root, '/admin/api/users');
    const global = await hubAdminTestRead(tokens.root, '/admin/api/global');
    const info = await relay(tokens.root, 'template', 'conversation/settings');

    const asUser = await Promise.all([
      hubAdminTestGet('/admin/api/global', tokens.bob),
      relay(tokens.bob, 'template', 'conversation/settings'),
    ]);

    expect(JSON.stringify(users.json)).not.toContain('template');
    expect(global.json).toMatchObject({ state: 'ready', sections: [{ id: 'models' }, { id: 'chat' }, { id: 'tools' }, { id: 'secrets' }, { id: 'sources' }] });
    expect(info.status).toBe(200);
    expect(asUser.map(({ status }) => status)).toEqual([403, 403]);
  });

  it("serves the template's bot avatars to admins only", async ({ tokens }) => {
    const created = await relay(tokens.root, 'template', 'bots/create', {
      name: 'Avatar template',
      handle: 'avatartemplate',
      modelProvider: 'anthropic',
      modelId: 'claude-opus-5-5',
      thinkingLevel: 'medium',
    });

    const { id } = z.object({ json: z.object({ id: z.uuid() }) }).parse(created.json).json;
    const own = await hubAdminTestGet(`/admin/api/users/template/avatars/bots/${id}.png`, tokens.root);
    const refused = await hubAdminTestGet(`/admin/api/users/template/avatars/bots/${id}.png`, tokens.bob);

    expect(own.status).toBe(200);
    expect(own.headers.get('cache-control')).toBe('private, no-store');
    expect(refused.status).toBe(403);
    expect((await relay(tokens.root, 'template', 'bots/delete', { botId: id })).status).toBe(200);
  });

  it('refuses the copy-only export and import procedures on the relay', async ({ tokens }) => {
    const procedures = ['providers/export', 'providers/import', 'secrets/export', 'secrets/import', 'tools/export', 'workspace/export', 'workspace/import', 'bots/exportFiles', 'bots/importFiles'];
    const responses = await Promise.all(procedures.flatMap((procedure) => ['template', 'alice'].map((user) => relay(tokens.root, user, procedure))));

    expect(responses.map(({ status }) => status)).toEqual(Array.from({ length: procedures.length * 2 }, () => 403));
  });

  it('copies a section when a user follows it, refuses writes with 409 and copies template saves to followers only', async ({ fixture, tokens }) => {
    await relay(tokens.root, 'template', 'conversation/configure', { whenBusy: 'steer' });
    await relay(tokens.root, 'template', 'secrets/save', secret('TEAM_KEY', 'team-secret'));

    const blind = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/chat', { method: 'PUT', body: { mode: 'global' } });
    const unswitched = await hubAdminTestRead(tokens.root, '/admin/api/users/alice/sections');
    const chat = await hubAdminTestBack(tokens.root, 'alice', 'chat');
    const again = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/chat', { method: 'PUT', body: { mode: 'global' } });
    const copied = await relay(tokens.root, 'alice', 'conversation/settings');
    const refused = await relay(tokens.root, 'alice', 'conversation/configure', { whenBusy: 'interrupt' });

    const passes = await Promise.all([
      relay(tokens.root, 'alice', 'conversation/settings'),
      relay(tokens.root, 'alice', 'bots/list'),
    ]);

    const own = await relay(tokens.root, 'bob', 'conversation/configure', { whenBusy: 'interrupt' });

    await relay(tokens.root, 'template', 'conversation/configure', { whenBusy: 'followUp' });

    const followed = await hubAdminTestUntil(async () => JSON.stringify((await relay(tokens.root, 'alice', 'conversation/settings')).json).includes('"followUp"'));
    const bob = await relay(tokens.root, 'bob', 'conversation/settings');

    await hubAdminTestBack(tokens.root, 'alice', 'secrets');
    await hubAdminTestBack(tokens.root, 'alice', 'models');

    const secrets = await relay(tokens.root, 'alice', 'secrets/list');
    const auth = JSON.parse(await readFile(join(fixture.root, 'alice/pi/auth.json'), 'utf8'));
    const sections = await hubAdminTestRead(tokens.root, '/admin/api/users/alice/sections');
    const back = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/chat', { method: 'PUT', body: { mode: 'overridden' } });
    const editable = await relay(tokens.root, 'alice', 'conversation/configure', { whenBusy: 'interrupt' });
    const overview = await hubAdminTestRead(tokens.root, '/admin/api/global/status');
    const sync = await hubAdminTestWrite(tokens.root, '/admin/api/global/sync', { body: {} });
    const invalid = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/devices', { method: 'PUT', body: { mode: 'global' } });

    expect(blind.status).toBe(422);
    expect(unswitched.json).toMatchObject({ sections: [{}, { id: 'chat', mode: 'overridden' }, {}, {}, {}] });
    expect(chat.json).toEqual({ sections: [{ id: 'chat', mode: 'global', sync: 'in-sync' }] });
    expect(again.json).toEqual({ sections: [{ id: 'chat', mode: 'global', sync: 'in-sync' }] });
    expect(JSON.stringify(copied.json)).toContain('"steer"');
    expect(refused).toEqual({ status: 409, json: { code: 'SECTION_FOLLOWS_GLOBAL', section: 'chat' } });
    expect(passes.map(({ status }) => status)).toEqual([200, 200]);
    expect(own.status).toBe(200);
    expect(followed).toBe(true);
    expect(JSON.stringify(bob.json)).toContain('"interrupt"');
    expect(JSON.stringify(secrets.json)).toContain('TEAM_KEY');
    expect(auth).toMatchObject({ anthropic: { type: 'api_key', key: 'hub-test-template' } });
    expect(sections.json).toMatchObject({ sections: [{ id: 'models', mode: 'global' }, { id: 'chat', mode: 'global' }, { id: 'tools', mode: 'overridden' }, { id: 'secrets', mode: 'global' }, { id: 'sources', mode: 'overridden' }] });
    expect(back.json).toEqual({ sections: [{ id: 'chat', mode: 'overridden', sync: 'in-sync' }] });
    expect(editable.status).toBe(200);
    expect(overview.json).toMatchObject({ users: [{ id: 'alice' }, { id: 'bob' }] });
    expect(sync.status).toBe(200);
    expect(invalid.status).toBe(404);
  });

  it('lets an advanced person, and no one else, take over a section that follows global, and a sync leaves it alone', async ({ fixture, tokens }) => {
    const { emails } = HUB_GLOBAL_FIXTURE;
    const override = (section = 'chat') => hubAdminTestWrite(tokens.bob, `/hub/sections/${section}/override`, { body: {} });

    await relay(tokens.root, 'bob', 'conversation/configure', { whenBusy: 'reject' });
    await hubAdminTestBack(tokens.root, 'bob', 'chat');

    const normal = await override();
    const before = await hubAdminTestRead(tokens.bob, '/hub/whoami');

    await fixture.writeUsers({ ...fixture.users, [emails.bob]: { ...fixture.users[emails.bob], advanced: true } });

    const advanced = await override();
    const adminOnly = await Promise.all(['tools', 'secrets'].map(async (section) => override(section)));
    const after = await hubAdminTestRead(tokens.bob, '/hub/whoami');
    const own = await relay(tokens.root, 'bob', 'conversation/configure', { whenBusy: 'interrupt' });

    await relay(tokens.root, 'template', 'conversation/configure', { whenBusy: 'steer' });
    await hubAdminTestWrite(tokens.root, '/admin/api/global/sync', { body: { section: 'chat' } });

    const kept = await relay(tokens.root, 'bob', 'conversation/settings');
    const audit = await hubAdminTestRead(tokens.root, '/admin/api/audit?user=bob');

    await fixture.writeUsers(fixture.users);

    expect(normal.status).toBe(403);
    expect(before.json).toMatchObject({ isAdvanced: false, sections: expect.arrayContaining([{ id: 'chat', mode: 'global' }]) });
    expect(advanced.json).toEqual({ id: 'chat', mode: 'overridden' });
    expect(adminOnly.map(({ status }) => status)).toEqual([403, 403]);
    expect(after.json).toMatchObject({ isAdvanced: true, sections: expect.arrayContaining([{ id: 'chat', mode: 'overridden' }]) });
    expect(own.status).toBe(200);
    expect(JSON.stringify(kept.json)).toContain('"interrupt"');
    expect(audit.json).toMatchObject({ entries: expect.arrayContaining([expect.objectContaining({
      by: emails.bob,
      action: 'sections/overridden',
      detail: 'chat',
      userId: 'bob',
      status: 200,
    })]) });
  });

  it('copies template bots with their own files to a user as new bots', async ({ fixture, tokens }) => {
    const created = await relay(tokens.root, 'template', 'bots/create', {
      name: 'Suggested',
      handle: 'suggested',
      modelProvider: 'anthropic',
      modelId: 'claude-opus-5-5',
      thinkingLevel: 'medium',
      instructions: 'Team instructions',
    });

    const templateBot = z.object({ json: z.object({ id: z.uuid() }) }).parse(created.json).json.id;

    await writeFile(join(fixture.root, 'template/agents', templateBot, 'AGENTS.md'), 'Suggested bot file');

    const copy = await hubAdminTestWrite(tokens.root, '/admin/api/users/bob/bots/copy', { body: { bots: [templateBot] } });
    const result = z.object({ bots: z.array(z.object({ from: z.uuid(), botId: z.uuid() })) }).parse(copy.json);
    const [{ botId }] = result.bots;
    const bot = await relay(tokens.root, 'bob', 'bots/get', { botId });

    expect(botId).not.toBe(templateBot);
    expect(bot.json).toMatchObject({ json: { name: 'Suggested', handle: 'suggested', instructions: 'Team instructions' } });
    expect(await readFile(join(fixture.root, 'bob/agents', botId, 'AGENTS.md'), 'utf8')).toBe('Suggested bot file');
  });

  it('never gives a person the template id and fails closed on an unreadable global.json', async ({ fixture, tokens }) => {
    const created = await hubAdminTestWrite(tokens.root, '/admin/api/users', { body: { name: 'Template', email: 'tpl@team.example' } });
    const path = join(fixture.hubData, 'global.json');
    const good = await readFile(path, 'utf8');

    await writeFile(path, '{"users": "everyone"}');

    const refused = await Promise.all([
      relay(tokens.root, 'bob', 'conversation/configure', { whenBusy: 'interrupt' }),
      hubAdminTestWrite(tokens.root, '/admin/api/users/bob/sections/chat', { method: 'PUT', body: { mode: 'global' } }),
    ]);

    const read = await relay(tokens.root, 'bob', 'conversation/settings');

    await writeFile(path, good);
    await fixture.writeUsers({ ...fixture.users, 'carol@team.example': { id: 'template', daemonUrl: 'http://localhost:1', socketPath: join(fixture.root, 'carol.sock') } });

    const reserved = await hubAdminTestGet('/health', tokens.bob);

    await fixture.writeUsers(fixture.users);
    await hubAdminTestWrite(tokens.root, `/admin/api/users/${z.object({ id: z.string() }).parse(created.json).id}`, { method: 'DELETE' });

    expect(created.json).toMatchObject({ id: 'template-2' });
    expect(refused.map(({ status, json }) => ({ status, json }))).toEqual([
      { status: 503, json: { error: 'global_state_unreadable' } },
      { status: 503, json: { error: 'global_state_unreadable' } },
    ]);
    expect(read.status).toBe(200);
    expect(reserved.status).toBe(403);
  });

  it("keeps a person's own secrets through a sync and Back to global, and lets them remove only their own", async ({ fixture, tokens }) => {
    const { hub, publicOrigin } = HUB_GLOBAL_FIXTURE;
    const secretList = z.object({ json: z.array(z.object({ name: z.string(), isGlobal: z.boolean().optional() })) });
    const listed = async () => Object.fromEntries(secretList.parse((await relay(tokens.root, 'alice', 'secrets/list')).json).json.map(({ name, isGlobal }) => [name, isGlobal === true]));

    await relay(tokens.root, 'template', 'secrets/save', secret('TEAM_TWO', 'team-two-secret'));
    await hubAdminTestBack(tokens.root, 'alice', 'secrets');

    const handoff = await hubAdminTestGet('/connect', tokens.alice);
    const { pin } = authPairCode.parse(new URL(handoff.headers.get('location') ?? '', hub).searchParams.get('code'));

    const redeemed = await fetch(`${hub}/rpc/pairing/redeem`, {
      method: 'POST',
      headers: { 'cf-access-jwt-assertion': tokens.alice, 'origin': publicOrigin, 'content-type': 'application/json', 'x-bots-protocol': '1' },
      body: JSON.stringify({ json: { pin, name: 'alice secrets test' } }),
    });

    const device = z.object({ json: authRedeemResult }).parse(await redeemed.json()).json;

    const person = makeHttpClient(() => ({
      url: `${hub}/rpc`,
      serverId: device.serverId,
      token: () => device.token,
      fetch: (url, init) => {
        const headers = new Headers(init.headers);

        headers.set('cf-access-jwt-assertion', tokens.alice);
        headers.set('origin', publicOrigin);

        return fetch(url, { ...init, headers });
      },
    }));

    await person.secrets.save(secret('ALICE_OWN', 'dummy-alice-own-value'));
    await person.secrets.save(secret('ALICE_CLASH', 'dummy-alice-clash-value'));

    const before = await listed();

    await relay(tokens.root, 'template', 'secrets/save', secret('ALICE_CLASH', 'team-clash-secret'));
    await hubAdminTestWrite(tokens.root, '/admin/api/global/sync', { body: { section: 'secrets' } });

    const synced = await listed();

    await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/secrets', { method: 'PUT', body: { mode: 'overridden' } });

    const preview = await hubAdminTestRead(tokens.root, '/admin/api/users/alice/sections/secrets/preview');
    const back = await hubAdminTestBack(tokens.root, 'alice', 'secrets');
    const switched = await listed();

    const credential = async (key: string, value: string | null) => person.credentials.set({ key, value });

    const refused = await Promise.allSettled([
      person.secrets.remove({ name: 'TEAM_KEY' }),
      person.secrets.save(secret('TEAM_TWO', 'dummy-alice-overwrite-value')),
      credential('secrets.TEAM_TWO', 'dummy-alice-overwrite-value'),
      credential('secrets.TEAM_KEY', null),
    ]);

    await person.secrets.remove({ name: 'ALICE_OWN' });
    await person.secrets.save(secret('ALICE_ADMIN', 'dummy-alice-admin-value'));

    const adminRemove = await relay(tokens.root, 'alice', 'secrets/remove', { name: 'ALICE_ADMIN' });
    const adminSave = await relay(tokens.root, 'alice', 'secrets/save', secret('ALICE_ADMIN', 'dummy-alice-admin-value'));

    await relay(tokens.root, 'template', 'secrets/remove', { name: 'TEAM_TWO' });
    await relay(tokens.root, 'template', 'secrets/remove', { name: 'ALICE_CLASH' });
    await hubAdminTestWrite(tokens.root, '/admin/api/global/sync', { body: { section: 'secrets' } });

    const after = await listed();
    const audit = await hubAdminTestRead(tokens.root, '/admin/api/audit?user=alice');
    const state = await readFile(join(fixture.hubData, 'global.json'), 'utf8');

    expect(before).toMatchObject({
      TEAM_KEY: true,
      TEAM_TWO: true,
      ALICE_OWN: false,
      ALICE_CLASH: false,
    });
    expect(synced).toMatchObject({
      TEAM_KEY: true,
      TEAM_TWO: true,
      ALICE_OWN: false,
      ALICE_CLASH: true,
    });
    expect(preview.json).toMatchObject({ items: [] });
    expect(back.json).toEqual({ sections: [{ id: 'secrets', mode: 'global', sync: 'in-sync' }] });
    expect(switched).toEqual(synced);
    expect(refused.map((result) => result.status === 'rejected' && JSON.stringify(result.reason))).toEqual(Array.from({ length: 4 }, () => expect.stringContaining('TEAM_MANAGED')));
    expect(adminRemove.status).toBe(200);
    expect(adminSave).toEqual({ status: 409, json: { code: 'SECTION_FOLLOWS_GLOBAL', section: 'secrets' } });
    expect(after).toEqual({ TEAM_KEY: true });
    expect(JSON.stringify([preview, audit, state])).not.toMatch(/dummy-|team-two-secret|team-clash-secret/u);
  });

  it('previews switching back to global by name only, changes nothing, and refuses a stale preview', async ({ fixture, tokens }) => {
    const preview = async (section: string, token = tokens.root) => hubAdminTestRead(token, `/admin/api/users/bob/sections/${section}/preview`);

    const bobHome = join(fixture.root, 'bob');
    const authPath = join(bobHome, 'pi/auth.json');
    const auth = z.record(z.string(), z.object({ type: z.string(), key: z.string() })).parse(JSON.parse(await readFile(authPath, 'utf8')));

    await mkdir(join(fixture.root, 'template/.agents/skills/team'), { recursive: true });
    await writeFile(join(fixture.root, 'template/.agents/skills/team/SKILL.md'), '---\nname: team\ndescription: Team skill\n---\nTeam');
    await mkdir(join(bobHome, '.agents/skills/team'), { recursive: true });
    await mkdir(join(bobHome, '.agents/skills/mine'), { recursive: true });
    await writeFile(join(bobHome, '.agents/skills/team/SKILL.md'), '---\nname: team\ndescription: Team skill\n---\nBob edit');
    await writeFile(join(bobHome, '.agents/skills/mine/SKILL.md'), '---\nname: mine\ndescription: Own skill\n---\nMine');
    await writeFile(join(bobHome, '.agents/mcp.json'), JSON.stringify({ mcpServers: { bobserver: { command: 'echo', args: ['dummy-mcp-arg-value'] } } }));
    await writeFile(authPath, JSON.stringify({ ...auth, openai: { type: 'api_key', key: 'dummy-openai-key-value' } }), { mode: 0o600 });

    const templateAuthPath = join(fixture.root, 'template/pi/auth.json');
    const templateAuth = z.record(z.string(), z.json()).parse(JSON.parse(await readFile(templateAuthPath, 'utf8')));

    await writeFile(templateAuthPath, JSON.stringify({ ...templateAuth, mistral: { type: 'api_key', key: 'dummy-template-mistral-value' } }), { mode: 0o600 });
    await relay(tokens.root, 'bob', 'secrets/save', secret('BOB_ONLY', 'dummy-bob-only-value'));
    await relay(tokens.root, 'bob', 'secrets/save', secret('TEAM_KEY', 'dummy-bob-team-value'));
    await relay(tokens.root, 'bob', 'tools/configure', { approvalTimeoutMinutes: 3 });

    const files = async () => Promise.all(['pi/auth.json', '.agents/mcp.json', '.agents/skills/mine/SKILL.md', '.agents/skills/team/SKILL.md'].map(async (path) => readFile(join(bobHome, path), 'utf8')));
    const reads = async () => Promise.all(['secrets/list', 'conversation/settings', 'tools/settings', 'skills/settings'].map(async (procedure) => JSON.stringify((await relay(tokens.root, 'bob', procedure)).json)));

    const before = {
      files: await files(),
      reads: await reads(),
      audit: await hubAdminTestRead(tokens.root, '/admin/api/audit'),
    };

    const sections = ['models', 'chat', 'tools', 'secrets', 'sources'] as const;
    const previews = await Promise.all(sections.map(async (section) => preview(section)));

    const after = {
      files: await files(),
      reads: await reads(),
      audit: await hubAdminTestRead(tokens.root, '/admin/api/audit'),
    };

    const named = Object.fromEntries(previews.map(({ json }, index) => [sections[index], previewItems.parse(json).items.filter(({ change }) => change !== 'added')]));

    const refused = await Promise.all([
      preview('secrets', tokens.bob),
      preview('secrets', tokens.eve),
      hubAdminTestRead(tokens.root, '/admin/api/users/template/sections/secrets/preview'),
      hubAdminTestRead(tokens.root, '/admin/api/users/bob/sections/devices/preview'),
    ]);

    expect(previews.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200]);
    expect(named).toEqual({
      models: [
        { kind: 'provider', name: 'anthropic', change: 'changed' },
        { kind: 'provider', name: 'mistral', change: 'replaced' },
        { kind: 'provider', name: 'openai', change: 'removed' },
        { kind: 'provider', name: 'xai', change: 'removed' },
      ],
      chat: [{ kind: 'chatSetting', name: 'whenBusy', change: 'changed' }],
      tools: [{ kind: 'toolSetting', name: 'approvalTimeoutMinutes', change: 'changed' }],
      secrets: [{ kind: 'secret', name: 'TEAM_KEY', change: 'replaced' }],
      sources: [
        { kind: 'skill', name: 'mine', change: 'removed' },
        { kind: 'skill', name: 'team', change: 'changed' },
        { kind: 'mcpServer', name: 'bobserver', change: 'removed' },
      ],
    });
    expect(JSON.stringify(previews)).not.toMatch(/dummy-|team-secret|hub-test-/u);
    expect(after.files).toEqual(before.files);
    expect(after.reads).toEqual(before.reads);
    expect(after.audit).toEqual(before.audit);
    expect(refused.map(({ status }) => status)).toEqual([403, 403, 404, 404]);

    const stale = previewItems.parse((await preview('secrets')).json).marker;

    await relay(tokens.root, 'bob', 'secrets/save', secret('BOB_LATE', 'dummy-bob-late-value'));

    const refusedSwitch = await hubAdminTestWrite(tokens.root, '/admin/api/users/bob/sections/secrets', {
      method: 'PUT',
      body: { mode: 'global', marker: stale },
    });

    const stillOwn = await hubAdminTestRead(tokens.root, '/admin/api/users/bob/sections');
    const fresh = previewItems.parse((await preview('secrets')).json);

    expect(refusedSwitch.status).toBe(409);
    expect(stillOwn.json).toMatchObject({ sections: [{}, {}, {}, { id: 'secrets', mode: 'overridden' }, {}] });
    expect(fresh.marker).not.toBe(stale);
    expect(fresh.items.map(({ name }) => name)).not.toContain('BOB_LATE');

    const marker = async (section: string) => previewItems.parse((await preview(section)).json).marker;
    const markers = Object.fromEntries(await Promise.all(sections.map(async (section) => [section, await marker(section)] as const)));

    const switched = await Promise.all(sections.map(async (section) => hubAdminTestWrite(tokens.root, `/admin/api/users/bob/sections/${section}`, {
      method: 'PUT',
      body: { mode: 'global', marker: markers[section] },
    })));

    const emptied = await Promise.all(sections.map(async (section) => previewItems.parse((await preview(section)).json).items));
    const secrets = await relay(tokens.root, 'bob', 'secrets/list');
    const mcp = await readFile(join(bobHome, '.agents/mcp.json'), 'utf8').catch(() => '');
    const stored = await readFile(authPath, 'utf8');

    expect(switched.map(({ json }) => json)).toEqual(sections.map((id) => ({ sections: [{ id, mode: 'global', sync: 'in-sync' }] })));
    expect(emptied).toEqual(sections.map(() => []));
    expect(secrets.json).toMatchObject({ json: expect.arrayContaining([
      { name: 'BOB_ONLY', hosts: ['api.example.com'] },
      { name: 'BOB_LATE', hosts: ['api.example.com'] },
      { name: 'TEAM_KEY', hosts: ['api.example.com'], isGlobal: true },
    ]) });
    expect(mcp).not.toContain('bobserver');
    expect(stored).not.toContain('openai');
    expect(stored).not.toContain('xai');
    expect(stored).toContain('mistral');
  });

  it('degrades the preview for a too-large ~/.agents and lists global secrets with no stored value', async ({ fixture, tokens }) => {
    const preview = async (section: string) => previewItems.parse((await hubAdminTestRead(tokens.root, `/admin/api/users/alice/sections/${section}/preview`)).json);

    const aliceHome = join(fixture.root, 'alice');

    await relay(tokens.root, 'template', 'secrets/save', secret('TEAM_EMPTY_KEPT', 'dummy-team-kept-value'));
    await relay(tokens.root, 'template', 'secrets/save', secret('TEAM_EMPTY_GONE', 'dummy-team-gone-value'));
    await hubAdminTestWrite(tokens.root, '/admin/api/global/sync', { body: { section: 'secrets' } });
    await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/secrets', { method: 'PUT', body: { mode: 'overridden' } });
    await relay(tokens.root, 'alice', 'credentials/set', { key: 'secrets.TEAM_EMPTY_KEPT', value: null });
    await relay(tokens.root, 'alice', 'credentials/set', { key: 'secrets.TEAM_EMPTY_GONE', value: null });
    await relay(tokens.root, 'template', 'secrets/remove', { name: 'TEAM_EMPTY_GONE' });

    const secrets = (await preview('secrets')).items.filter(({ name }) => name.startsWith('TEAM_EMPTY_'));

    await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/sources', { method: 'PUT', body: { mode: 'overridden' } });
    await mkdir(join(aliceHome, '.agents/skills/big'), { recursive: true });
    await writeFile(join(aliceHome, '.agents/skills/big/data.bin'), Buffer.alloc(7 * 1024 * 1024, 1));
    await relay(tokens.root, 'alice', 'skills/configure', { directories: ['~/elsewhere'] });

    const sources = await preview('sources');
    const again = await preview('sources');

    const switched = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/sources', {
      method: 'PUT',
      body: { mode: 'global', marker: sources.marker },
    });

    const big = await readFile(join(aliceHome, '.agents/skills/big/data.bin')).then(() => true, () => false);
    const after = await preview('sources');

    expect(secrets).toEqual([
      { kind: 'secret', name: 'TEAM_EMPTY_GONE', change: 'removed' },
      { kind: 'secret', name: 'TEAM_EMPTY_KEPT', change: 'changed' },
    ]);
    expect(sources.isPartial).toBe(true);
    expect(sources.items.map(({ kind }) => kind)).not.toContain('skill');
    expect(sources.items.filter(({ kind }) => kind === 'sourceSetting').map(({ name, change }) => `${name}:${change}`)).toContain('skills:changed');
    expect(again.marker).toBe(sources.marker);
    expect(switched.json).toEqual({ sections: [{ id: 'sources', mode: 'global', sync: 'in-sync' }] });
    expect(big).toBe(false);
    expect(after).toMatchObject({ isPartial: false, items: [] });
  });
});
