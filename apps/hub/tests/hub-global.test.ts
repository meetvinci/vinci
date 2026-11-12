import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { hubAdminTestKit } from './support/hub-admin.fixture';
import { HUB_GLOBAL_FIXTURE } from './support/hub.fixture';

const { it, get: hubAdminTestGet, read: hubAdminTestRead, write: hubAdminTestWrite } = hubAdminTestKit(HUB_GLOBAL_FIXTURE);

describe('global settings and the template workspace', () => {
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
    const procedures = ['providers/export', 'providers/import', 'secrets/export', 'tools/export', 'workspace/export', 'workspace/import', 'bots/exportFiles', 'bots/importFiles'];
    const responses = await Promise.all(procedures.flatMap((procedure) => ['template', 'alice'].map((user) => relay(tokens.root, user, procedure))));

    expect(responses.map(({ status }) => status)).toEqual(Array.from({ length: procedures.length * 2 }, () => 403));
  });

  it('copies a section when a user follows it, refuses writes with 409 and copies template saves to followers only', async ({ fixture, tokens }) => {
    await relay(tokens.root, 'template', 'conversation/configure', { whenBusy: 'steer' });
    await relay(tokens.root, 'template', 'secrets/save', {
      name: 'TEAM_KEY',
      hosts: ['api.example.com'],
      value: 'team-secret',
    });

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
    const override = () => hubAdminTestWrite(tokens.bob, '/hub/sections/chat/override', { body: {} });

    await relay(tokens.root, 'bob', 'conversation/configure', { whenBusy: 'reject' });
    await hubAdminTestBack(tokens.root, 'bob', 'chat');

    const normal = await override();
    const before = await hubAdminTestRead(tokens.bob, '/hub/whoami');

    await fixture.writeUsers({ ...fixture.users, [emails.bob]: { ...fixture.users[emails.bob], advanced: true } });

    const advanced = await override();
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

  it('previews switching back to global by name only, changes nothing, and refuses a stale preview', async ({ fixture, tokens }) => {
    const preview = async (section: string, token = tokens.root) => hubAdminTestRead(token, `/admin/api/users/bob/sections/${section}/preview`);

    const item = z.object({
      kind: z.string(),
      name: z.string(),
      change: z.string(),
    });

    const items = z.object({ marker: z.string(), items: z.array(item) });
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
    await relay(tokens.root, 'bob', 'secrets/save', {
      name: 'BOB_ONLY',
      hosts: ['api.example.com'],
      value: 'dummy-bob-only-value',
    });
    await relay(tokens.root, 'bob', 'secrets/save', {
      name: 'TEAM_KEY',
      hosts: ['api.example.com'],
      value: 'dummy-bob-team-value',
    });
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

    const named = Object.fromEntries(previews.map(({ json }, index) => [sections[index], items.parse(json).items.filter(({ change }) => change !== 'added')]));

    const refused = await Promise.all([
      preview('secrets', tokens.bob),
      preview('secrets', tokens.eve),
      hubAdminTestRead(tokens.root, '/admin/api/users/template/sections/secrets/preview'),
      hubAdminTestRead(tokens.root, '/admin/api/users/bob/sections/devices/preview'),
    ]);

    expect(previews.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200]);
    expect(named).toEqual({
      models: [{ kind: 'provider', name: 'anthropic', change: 'changed' }, { kind: 'provider', name: 'openai', change: 'removed' }],
      chat: [{ kind: 'chatSetting', name: 'whenBusy', change: 'changed' }],
      tools: [{ kind: 'toolSetting', name: 'approvalTimeoutMinutes', change: 'changed' }],
      secrets: [{ kind: 'secret', name: 'BOB_ONLY', change: 'removed' }, { kind: 'secret', name: 'TEAM_KEY', change: 'changed' }],
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

    const stale = items.parse((await preview('secrets')).json).marker;

    await relay(tokens.root, 'bob', 'secrets/save', {
      name: 'BOB_LATE',
      hosts: ['api.example.com'],
      value: 'dummy-bob-late-value',
    });

    const refusedSwitch = await hubAdminTestWrite(tokens.root, '/admin/api/users/bob/sections/secrets', {
      method: 'PUT',
      body: { mode: 'global', marker: stale },
    });

    const stillOwn = await hubAdminTestRead(tokens.root, '/admin/api/users/bob/sections');
    const fresh = items.parse((await preview('secrets')).json);

    expect(refusedSwitch.status).toBe(409);
    expect(stillOwn.json).toMatchObject({ sections: [{}, {}, {}, { id: 'secrets', mode: 'overridden' }, {}] });
    expect(fresh.items.map(({ name }) => name)).toContain('BOB_LATE');

    const marker = async (section: string) => items.parse((await preview(section)).json).marker;
    const markers = Object.fromEntries(await Promise.all(sections.map(async (section) => [section, await marker(section)] as const)));

    const switched = await Promise.all(sections.map(async (section) => hubAdminTestWrite(tokens.root, `/admin/api/users/bob/sections/${section}`, {
      method: 'PUT',
      body: { mode: 'global', marker: markers[section] },
    })));

    const emptied = await Promise.all(sections.map(async (section) => items.parse((await preview(section)).json).items));
    const secrets = await relay(tokens.root, 'bob', 'secrets/list');
    const mcp = await readFile(join(bobHome, '.agents/mcp.json'), 'utf8').catch(() => '');
    const stored = await readFile(authPath, 'utf8');

    expect(switched.map(({ json }) => json)).toEqual(sections.map((id) => ({ sections: [{ id, mode: 'global', sync: 'in-sync' }] })));
    expect(emptied).toEqual(sections.map(() => []));
    expect(JSON.stringify(secrets.json)).not.toMatch(/BOB_ONLY|BOB_LATE/u);
    expect(mcp).not.toContain('bobserver');
    expect(stored).not.toContain('openai');
  });
});
