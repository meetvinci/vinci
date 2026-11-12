import { readFile, writeFile } from 'node:fs/promises';
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

    const chat = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/chat', { method: 'PUT', body: { mode: 'global' } });
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

    await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/secrets', { method: 'PUT', body: { mode: 'global' } });
    await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/models', { method: 'PUT', body: { mode: 'global' } });

    const secrets = await relay(tokens.root, 'alice', 'secrets/list');
    const auth = JSON.parse(await readFile(join(fixture.root, 'alice/pi/auth.json'), 'utf8'));
    const sections = await hubAdminTestRead(tokens.root, '/admin/api/users/alice/sections');
    const back = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/chat', { method: 'PUT', body: { mode: 'overridden' } });
    const editable = await relay(tokens.root, 'alice', 'conversation/configure', { whenBusy: 'interrupt' });
    const overview = await hubAdminTestRead(tokens.root, '/admin/api/global/status');
    const sync = await hubAdminTestWrite(tokens.root, '/admin/api/global/sync', { body: {} });
    const invalid = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/sections/devices', { method: 'PUT', body: { mode: 'global' } });

    expect(chat.json).toEqual({ sections: [{ id: 'chat', mode: 'global', sync: 'in-sync' }] });
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
});
