import { join } from 'node:path';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';
import { hubAdminTestKit } from './support/hub-admin.fixture';
import { HUB_RELAY_FIXTURE, hubFixtureFakeSocket } from './support/hub.fixture';

const { hub, publicOrigin, emails } = HUB_RELAY_FIXTURE;
const { it, get: hubAdminTestGet, read: hubAdminTestRead, write: hubAdminTestWrite, person: hubAdminTestPerson } = hubAdminTestKit(HUB_RELAY_FIXTURE);

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

  it("reaches the user's real owner socket for the forms and refuses conversation writes, approvals and pairing", async ({ fixture, tokens }) => {
    const before = fixture.logs.length;
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
      'conversation/markRead',
      'conversation/watch',
      'tools/answer',
      'attachments/upload',
      'routines/create',
      'routines/run',
      'routines/remove',
      'todos/create',
      'todos/update',
    ].map((procedure) => call(procedure)));

    const readOnly = await Promise.all(['routines/list', 'todos/list'].map((procedure) => hubAdminTestWrite(tokens.root, `/admin/api/users/alice/rpc/${procedure}`, {
      body: { json: { botId: crypto.randomUUID() } },
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
    expect(fixture.logs.slice(before).join('').match(/Admin read routines or todos/gu)).toHaveLength(2);
    expect(asGet.status).toBe(404);
    expect(swapped.status).toBe(409);
  });

  it("reads and changes a person's rate limits within bounds, audited as a change, while their devices stay refused", async ({ tokens }) => {
    const limits = (procedure: string, input: object | null) => hubAdminTestWrite(tokens.root, `/admin/api/users/bob/rpc/limits/${procedure}`, { body: { json: input }, headers: { 'x-bots-protocol': '1' } });
    const before = await limits('settings', null);
    const changed = await limits('configure', { device: { maxRequests: 1200, windowMs: 60_000 }, rpcInFlight: 40 });

    const outOfBounds = await Promise.all([
      { device: { maxRequests: 5 } },
      { redeem: { maxRequests: 500 } },
      { public: { windowMs: 10 } },
      { public: { maxRequests: 60, windowMs: 3_600_000 } },
      { redeem: { maxRequests: 100, windowMs: 1000 } },
      { device: { maxRequests: 600.5 } },
      { rpcInFlight: 1 },
      { watchInFlight: 5000 },
    ].map(async (input) => limits('configure', input)));

    const after = await limits('settings', null);
    const person = await hubAdminTestPerson(tokens.bob);
    const own = await person.limits.settings();

    await expect(person.limits.configure({ rpcInFlight: 100 })).rejects.toMatchObject({ code: 'TEAM_MANAGED' });

    const audit = await hubAdminTestRead(tokens.root, '/admin/api/audit?user=bob');

    const auditRow = z.object({
      kind: z.string(),
      action: z.string(),
      status: z.number(),
    });

    const rows = z.object({ entries: z.array(auditRow) }).parse(audit.json).entries;

    expect(before.status).toBe(200);
    expect(before.json).toMatchObject({ json: { device: { maxRequests: 600 }, rpcInFlight: 32 } });
    expect(changed.status).toBe(200);
    expect(outOfBounds.map(({ status }) => status)).toEqual(outOfBounds.map(() => 400));
    expect(after.json).toMatchObject({ json: { device: { maxRequests: 1200, windowMs: 60_000 }, rpcInFlight: 40, watchInFlight: 64 } });
    expect(own).toMatchObject({ device: { maxRequests: 1200 }, rpcInFlight: 40 });
    expect(rows.filter(({ action }) => action.startsWith('limits/'))).toEqual([
      ...outOfBounds.map(() => ({ kind: 'change', action: 'limits/configure', status: 400 })),
      { kind: 'change', action: 'limits/configure', status: 200 },
    ].map((row) => expect.objectContaining(row)));
  });
});

describe('conversation viewer through the relay', () => {
  const viewerReads = (botId: string, conversationId: number) => [
    ['conversation/history', { botId, conversationId, limit: 2 }],
    ['conversation/search', { botId, query: 'VIEWER-QUERY-TEXT' }],
    ['conversation/reactions', { botId, entryIds: [1] }],
  ] as const;

  it("reads a person's chat, files and lists without changing what the person sees, and logs each read without content", async ({ fixture, tokens }) => {
    const created = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/rpc/bots/create', {
      body: { json: { name: 'Viewerbot', handle: 'viewerbot', modelProvider: 'anthropic', modelId: 'claude-opus-5-5', thinkingLevel: 'medium' } },
      headers: { 'x-bots-protocol': '1' },
    });

    const { id: botId } = z.object({ json: z.object({ id: z.uuid() }) }).parse(created.json).json;
    const person = await hubAdminTestPerson(tokens.alice);

    const attachment = await person.attachments.upload({ botId, file: new File(['viewer attachment body'], 'note.txt', { type: 'text/plain' }) });

    await person.conversation.submit({
      botId,
      requestId: crypto.randomUUID(),
      content: 'VIEWER-MESSAGE-TEXT',
      attachmentIds: [attachment.id],
    });
    await vi.waitFor(async () => expect(JSON.stringify(await person.conversation.history({ botId, limit: 5 }))).toContain('Mock reply'), { timeout: 30_000, interval: 250 });

    const snapshot = async () => JSON.stringify([await person.conversation.list(), await person.sidebarSections.list()]);
    const before = await snapshot();
    const read = (procedure: string, input: object, user = 'alice', token = tokens.root) => hubAdminTestWrite(token, `/admin/api/users/${user}/rpc/${procedure}`, { body: { json: input }, headers: { 'x-bots-protocol': '1' } });
    const list = await read('conversation/list', {});
    const items = z.object({ json: z.array(z.object({ botId: z.string(), conversationId: z.number() })) }).parse(list.json).json;
    const conversationId = items.find((item) => item.botId === botId)?.conversationId ?? 0;
    const reads = await Promise.all(viewerReads(botId, conversationId).map(([procedure, input]) => read(procedure, input)));
    const history = await read('conversation/history', { botId, limit: 2 });
    const cursor = z.object({ json: z.object({ next: z.record(z.string(), z.json()) }) }).parse(history.json).json.next;

    const older = await read('conversation/history', {
      botId,
      limit: 2,
      cursor,
    });

    const file = (path: string, token = tokens.root, headers: Record<string, string> = {}) => hubAdminTestGet(`/admin/api/users/${path}`, token, headers);
    const own = await file(`alice/files/${botId}/${attachment.id}`);
    const ranged = await file(`alice/files/${botId}/${attachment.id}`, tokens.root, { range: 'bytes=0-5' });
    const later = await file(`alice/files/${botId}/${attachment.id}`, tokens.root, { range: 'bytes=2-5' });
    const crossSite = await file(`alice/files/${botId}/${attachment.id}`, tokens.root, { 'sec-fetch-site': 'cross-site' });
    const whole = await Promise.all(['x', 'bytes=-1000', 'bytes=00-'].map(async (range) => (await file(`alice/files/${botId}/${attachment.id}`, tokens.root, { range })).text()));

    const tricks = await Promise.all([
      file(`alice/files/${botId}/${attachment.id}`, tokens.bob),
      file(`bob/files/${botId}/${attachment.id}`),
      file(`nobody/files/${botId}/${attachment.id}`),
      file(`alice/files/${botId}/${attachment.id}/poster`),
      file(`alice/files/${botId}/${attachment.id}/other`),
      file(`alice/files/${botId}/${attachment.id}%2Fposter`),
      file(`alice/files/${botId}/not-a-uuid`),
      file(`alice/files/${botId}`),
      file('alice/files/../../avatars/x.png'),
      file(`alice/files/${botId}/${crypto.randomUUID()}`),
    ]);

    const refusedPerson = await read('conversation/history', { botId }, 'alice', tokens.bob);
    const after = await snapshot();

    const logs = fixture.logs.join('');
    const audits = logs.split(/\n(?=\S)/u).filter((line) => line.includes('Admin read a conversation'));

    expect(list.status).toBe(200);
    expect(reads.map(({ status }) => status)).toEqual(viewerReads(botId, conversationId).map(() => 200));
    expect(JSON.stringify(history.json)).toContain('Mock reply');
    expect(older.status).toBe(200);
    expect(JSON.stringify(older.json)).toContain('VIEWER-MESSAGE-TEXT');
    expect(own.status).toBe(200);
    expect(await own.text()).toBe('viewer attachment body');
    expect(own.headers.get('cache-control')).toBe('private, no-store');
    expect(own.headers.get('content-disposition')).toMatch(/^attachment; filename="note.txt"/u);
    expect(own.headers.get('content-security-policy')).toContain('sandbox');
    expect(own.headers.get('x-content-type-options')).toBe('nosniff');
    expect(ranged.status).toBe(206);
    expect(await ranged.text()).toBe('viewer');
    expect(later.status).toBe(206);
    expect(crossSite.status).toBe(403);
    expect(tricks.map(({ status }) => status)).toEqual([403, 404, 404, 404, 404, 404, 404, 404, 404, 404]);
    expect(refusedPerson.status).toBe(403);
    expect(after).toBe(before);
    expect(audits.filter((line) => line.includes(botId) && line.includes('conversation/history'))).toHaveLength(3);
    expect(audits.filter((line) => line.includes('conversation/list'))).not.toHaveLength(0);
    // Reads: the whole file, a range from byte 0, three odd ranges that still serve from byte 0, and the two misses (bob, an unknown id). A later range and a cross-site request write no line.
    expect(whole).toEqual(['viewer attachment body', 'viewer attachment body', 'viewer attachment body']);
    expect(audits.filter((line) => line.includes('attachments/download'))).toHaveLength(7);
    expect(audits.filter((line) => line.includes('conversation/reactions'))).toHaveLength(0);
    expect(logs).not.toContain('VIEWER-MESSAGE-TEXT');
    expect(logs).not.toContain('VIEWER-QUERY-TEXT');
    expect(logs).not.toContain('viewer attachment body');
  });

  it('opens an artifact by version and shows what waits for the person, without changing what they see, and audits only real reads', async ({ fixture, tokens }) => {
    const create = async (handle: string) => z.object({ json: z.object({ id: z.uuid() }) }).parse((await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/rpc/bots/create', {
      body: { json: { name: handle, handle, modelProvider: 'anthropic', modelId: 'claude-opus-5-5', thinkingLevel: 'medium' } },
      headers: { 'x-bots-protocol': '1' },
    })).json).json.id;

    const [asker, approver] = [await create('askerbot'), await create('approverbot')];
    const person = await hubAdminTestPerson(tokens.alice);
    const text = (value: string) => ({ root: 'text', elements: { text: { type: 'Text', props: { text: value }, children: [] } }, state: { seen: false } });

    const first = await person.artifacts.create({
      botId: approver,
      title: 'Viewer artifact',
      spec: text('ARTIFACT-V1-TEXT'),
    });

    await person.artifacts.update({
      botId: approver,
      artifactId: first.id,
      version: first.version,
      spec: text('ARTIFACT-V2-TEXT'),
    });
    await person.conversation.submit({
      botId: approver,
      requestId: crypto.randomUUID(),
      content: 'MOCK-TOOL bash {"command":"echo WAITING-COMMAND"}',
    });
    await person.conversation.submit({
      botId: asker,
      requestId: crypto.randomUUID(),
      content: 'MOCK-TOOL bot_question {"text":"WAITING-QUESTION?","choices":["Yes","No"]}',
    });
    await vi.waitFor(async () => expect(await person.tools.pending({ botId: approver })).toHaveLength(1), { timeout: 30_000, interval: 250 });
    await vi.waitFor(async () => expect(await person.conversation.questions({ botId: asker })).toHaveLength(1), { timeout: 30_000, interval: 250 });

    const ref = { botId: approver, conversationId: first.conversationId, artifactId: first.id };

    const snapshot = async () => JSON.stringify([
      await person.conversation.list(),
      await person.sidebarSections.list(),
      await person.artifacts.get(ref),
      await person.artifacts.versions(ref),
      await person.artifacts.list({ botId: approver }),
      await person.tools.pending({ botId: approver }),
      await person.conversation.questions({ botId: asker }),
    ]);

    const before = await snapshot();
    const logged = fixture.logs.length;
    const read = (procedure: string, input: object) => hubAdminTestWrite(tokens.root, `/admin/api/users/alice/rpc/${procedure}`, { body: { json: input }, headers: { 'x-bots-protocol': '1' } });

    const reads = await Promise.all([
      read('artifacts/get', { ...ref, version: 1 }),
      read('artifacts/get', ref),
      read('artifacts/versions', ref),
      read('tools/pending', { botId: approver }),
      read('conversation/questions', { botId: asker }),
      read('tools/pending', { botId: asker }),
      read('conversation/questions', { botId: approver }),
    ]);

    const writes = await Promise.all([
      // The door refuses by procedure before it reads the input, so a bare target is enough.
      read('artifacts/saveState', ref),
      read('artifacts/restore', ref),
      read('tools/answer', { botId: approver }),
      read('conversation/answerQuestion', { botId: asker }),
    ]);

    const after = await snapshot();
    const logs = fixture.logs.slice(logged).join('');
    const audits = logs.split(/\n(?=\S)/u).filter((line) => line.includes('Admin read a conversation'));
    const [v1, v2, versions, pending, questions, nothingPending, noQuestions] = reads.map(({ json }) => JSON.stringify(json));

    expect(reads.map(({ status }) => status)).toEqual(reads.map(() => 200));
    expect(v1).toContain('ARTIFACT-V1-TEXT');
    expect(v2).toContain('ARTIFACT-V2-TEXT');
    expect(versions).toContain('"version":1');
    expect(pending).toContain('WAITING-COMMAND');
    expect(questions).toContain('WAITING-QUESTION?');
    expect([nothingPending, noQuestions]).toEqual(['{"json":[]}', '{"json":[]}']);
    expect(writes.map(({ status }) => status)).toEqual([403, 403, 403, 403]);
    expect(after).toBe(before);
    expect(audits.filter((line) => line.includes('artifacts/get') && line.includes(approver))).toHaveLength(2);
    expect(audits.filter((line) => line.includes('artifacts/versions'))).toHaveLength(0);
    expect(audits.filter((line) => line.includes('tools/pending')).map((line) => line.includes(approver))).toEqual([true]);
    expect(audits.filter((line) => line.includes('conversation/questions')).map((line) => line.includes(asker))).toEqual([true]);
    expect(['ARTIFACT-V1-TEXT', 'ARTIFACT-V2-TEXT', 'WAITING-COMMAND', 'WAITING-QUESTION'].filter((content) => logs.includes(content))).toEqual([]);
  });

  it('refuses the reads the viewer does not use, and an audited read whose body the hub cannot parse', async ({ fixture, tokens }) => {
    const botId = crypto.randomUUID();
    const unused = ['conversation/contexts', 'artifacts/list', 'artifacts/listBot', 'artifacts/blocks', 'activity/list', 'activity/run', 'attachments/list', 'attachments/download', 'attachments/poster', 'links/preview'];

    const refused = await Promise.all(unused.map(async (procedure) => (await hubAdminTestWrite(tokens.root, `/admin/api/users/alice/rpc/${procedure}`, {
      body: { json: { botId } },
      headers: { 'x-bots-protocol': '1' },
    })).status));

    const history = `${hub}/admin/api/users/alice/rpc/conversation/history`;
    const headers = { 'cf-access-jwt-assertion': tokens.root, 'origin': publicOrigin, 'x-bots-protocol': '1' };
    const form = new FormData();

    form.set('data', JSON.stringify({ json: { botId, limit: 1 } }));

    const before = fixture.logs.length;

    const bodies = await Promise.all([
      fetch(history, {
        method: 'POST',
        headers,
        body: form,
      }),
      fetch(history, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: '{"json":',
      }),
      fetch(history, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ json: { limit: 1 } }),
      }),
      fetch(history, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'text/plain' },
        body: JSON.stringify({ json: { botId } }),
      }),
      fetch(history, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ json: { botId, pad: 'x'.repeat(70_000) } }),
      }),
    ]);

    const logs = fixture.logs.slice(before).join('');

    expect(refused).toEqual(unused.map(() => 403));
    expect(bodies.map(({ status }) => status)).toEqual([422, 422, 422, 422, 422]);
    expect(logs).not.toContain('Admin read a conversation');
  });

  it('refuses every conversation and tool write through the relay', async ({ tokens }) => {
    const writes = [
      'conversation/submit',
      'conversation/updateSubmission',
      'conversation/stop',
      'conversation/clear',
      'conversation/answerQuestion',
      'conversation/setReaction',
      'conversation/markRead',
      'conversation/arrange',
      'conversation/setPinned',
      'conversation/setHidden',
      'conversation/setMuted',
      'conversation/setWhenBusy',
      'conversation/watch',
      'conversation/watchList',
      'tools/answer',
      'artifacts/create',
      'artifacts/update',
      'artifacts/saveState',
      'artifacts/restore',
      'attachments/upload',
      'attachments/remove',
      'sidebarSections/arrange',
      'commands/list',
    ];

    const statuses = await Promise.all(writes.map(async (procedure) => (await hubAdminTestWrite(tokens.root, `/admin/api/users/alice/rpc/${procedure}`, {
      body: { json: { botId: crypto.randomUUID() } },
      headers: { 'x-bots-protocol': '1' },
    })).status));

    expect(statuses).toEqual(writes.map(() => 403));
  });

  it('lists the template workspace, which has no chats with anyone', async ({ tokens }) => {
    const list = await hubAdminTestWrite(tokens.root, '/admin/api/users/template/rpc/conversation/list', { headers: { 'x-bots-protocol': '1' } });

    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json)).not.toContain('lastMessage":{');
  });
});
