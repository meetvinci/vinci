import { adminAuditPage } from '@repo/contracts/universal';
import { chmod, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { hubAdminTestKit } from './support/hub-admin.fixture';
import { HUB_AUDIT_FIXTURE } from './support/hub.fixture';

const { it, get: hubAdminTestGet, read: hubAdminTestRead, write: hubAdminTestWrite } = hubAdminTestKit(HUB_AUDIT_FIXTURE);

describe('audit trail', () => {
  const audit = async (token: string, query = '') => {
    const { status, json } = await hubAdminTestRead(token, `/admin/api/audit${query}`);

    return { status, page: status === 200 ? adminAuditPage.parse(json) : null };
  };

  it('is for admins only, read only, and not itself recorded', async ({ fixture, tokens }) => {
    // The hub records its own sync at start in the background, after it answers health; wait for that row so it cannot land between the two reads.
    await expect.poll(async () => (await audit(tokens.root)).page?.entries.some((entry) => entry.by === 'hub start'), { timeout: 30_000 }).toBe(true);

    const before = (await audit(tokens.root)).page?.entries.at(0)?.id;

    const refused = await Promise.all([
      audit(tokens.bob),
      audit(tokens.eve),
    ]);

    const signedOut = await hubAdminTestGet('/admin/api/audit');
    const writes = await Promise.all(['POST', 'PUT', 'PATCH', 'DELETE'].map(async (method) => (await hubAdminTestWrite(tokens.root, '/admin/api/audit', { method, body: {} })).status));
    const removeOne = await hubAdminTestWrite(tokens.root, `/admin/api/audit/${String(before ?? 1)}`, { method: 'DELETE' });
    const invalid = await Promise.all(['?kind=other', '?cursor=x', '?by=nobody', '?extra=1'].map(async (query) => (await audit(tokens.root, query)).status));
    const after = (await audit(tokens.root)).page?.entries.at(0)?.id;

    expect(refused.map(({ status }) => status)).toEqual([403, 403]);
    expect(signedOut.status).toBe(401);
    expect(writes).toEqual([404, 404, 404, 404]);
    expect(removeOne.status).toBe(404);
    expect(invalid).toEqual([422, 422, 422, 422]);
    expect(after).toBe(before);
    expect(fixture.logs.join('')).not.toContain('action: \'audit');
  });

  it('records reads and changes without content, and never a value sent through the relay', async ({ fixture, tokens }) => {
    const secret = `AUDIT-SECRET-${crypto.randomUUID()}`;
    const rpc = (procedure: string, json: object | null, user = 'alice') => hubAdminTestWrite(tokens.root, `/admin/api/users/${user}/rpc/${procedure}`, { body: { json }, headers: { 'x-bots-protocol': '1' } });

    const created = await rpc('bots/create', {
      name: 'Auditbot',
      handle: 'auditbot',
      modelProvider: 'anthropic',
      modelId: 'claude-opus-5-5',
      thinkingLevel: 'medium',
    });

    const { id: botId } = z.object({ json: z.object({ id: z.uuid() }) }).parse(created.json).json;

    const saved = await rpc('secrets/save', {
      name: 'AUDIT_TOKEN',
      hosts: ['api.example.com'],
      value: secret,
    });

    const updated = await rpc('bots/update', { botId, instructions: secret });
    const quiet = await Promise.all(['bots/list', 'secrets/list', 'server/info'].map((procedure) => rpc(procedure, null)));
    const alwaysAllowed = await rpc('tools/alwaysAllowed', { botId });
    const cleared = await rpc('tools/clearAlwaysAllowed', { botId, toolName: 'bash' });

    const history = await rpc('conversation/history', {
      botId,
      conversationId: 7,
      limit: 1,
    });

    const reactions = await rpc('conversation/reactions', { botId, entryIds: [1] });
    const added = await hubAdminTestWrite(tokens.root, '/admin/api/admins', { body: { email: 'audit-admin@example.com' } });
    const removed = await hubAdminTestWrite(tokens.root, `/admin/api/admins/${encodeURIComponent('audit-admin@example.com')}`, { method: 'DELETE' });
    const refused = await rpc('workspace/export', {});
    const { page } = await audit(tokens.root);
    const rows = page?.entries ?? [];
    const row = (action: string) => rows.find((entry) => entry.action === action);
    const file = await readFile(join(fixture.root, 'hub/audit.sqlite'));

    expect([saved.status, updated.status, history.status, reactions.status, added.status, removed.status]).toEqual([200, 200, 404, 200, 200, 200]);
    expect(quiet.map(({ status }) => status)).toEqual([200, 200, 200]);
    expect([alwaysAllowed.status, cleared.status]).toEqual([200, 200]);
    expect(row('tools/clearAlwaysAllowed')).toMatchObject({
      kind: 'change',
      userId: 'alice',
      botId,
      status: 200,
    });
    expect(row('bots/create')).toMatchObject({
      kind: 'change',
      userId: 'alice',
      botId: null,
      status: 200,
      by: HUB_AUDIT_FIXTURE.admin,
    });
    expect(row('secrets/save')).toMatchObject({
      kind: 'change',
      userId: 'alice',
      status: 200,
      detail: null,
    });
    expect(row('bots/update')).toMatchObject({
      kind: 'change',
      botId,
      status: 200,
    });
    expect(row('conversation/history')).toMatchObject({
      kind: 'read',
      userId: 'alice',
      botId,
      conversationId: 7,
      status: 404,
    });
    expect(row('admins/add')).toMatchObject({
      kind: 'change',
      detail: 'audit-admin@example.com',
      userId: null,
      status: 200,
    });
    expect(row('admins/remove')).toMatchObject({
      kind: 'change',
      detail: 'audit-admin@example.com',
      status: 200,
    });
    expect(refused.status).toBe(403);
    expect(row('workspace/export')).toMatchObject({ kind: 'change', status: 403 });
    expect(rows.filter((entry) => /^(?:bots|secrets)\/list$|^server\/info$|^conversation\/reactions$|^tools\/alwaysAllowed$/u.test(entry.action))).toEqual([]);
    expect(file.includes(secret)).toBe(false);
    expect(fixture.logs.join('')).not.toContain(secret);
  });

  it('refuses a read it cannot record, and keeps a change it could not record', async ({ fixture, tokens }) => {
    const folder = join(fixture.root, 'hub');
    const botId = crypto.randomUUID();
    const before = (await audit(tokens.root)).page?.entries.at(0)?.id;

    await chmod(folder, 0o500);

    const read = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/rpc/conversation/history', { body: { json: { botId, limit: 1 } }, headers: { 'x-bots-protocol': '1' } });
    const file = await hubAdminTestGet(`/admin/api/users/alice/files/${botId}/${crypto.randomUUID()}`, tokens.root);
    const change = await hubAdminTestWrite(tokens.root, '/admin/api/users/alice/rpc/secrets/configure', { body: { json: {} }, headers: { 'x-bots-protocol': '1' } });

    await chmod(folder, 0o700);

    const after = (await audit(tokens.root)).page?.entries.at(0)?.id;
    const logs = fixture.logs.join('');

    expect(read).toEqual({ status: 503, json: { error: 'audit_unavailable' } });
    expect(file.status).toBe(503);
    expect(change.status).toBe(200);
    expect(after).toBe(before);
    expect(logs).toContain('The audit trail could not record a read; the read is refused');
    expect(logs).toContain('The audit trail could not record a change; the change stands');
  });

  it('records loading outside content as its own read, and loads nothing it cannot record', async ({ fixture, tokens }) => {
    const target = { botId: crypto.randomUUID(), conversationId: 7 };
    const outside = (token: string, body: object, user = 'alice') => hubAdminTestWrite(token, `/admin/api/users/${user}/outside`, { body });

    const loaded = await outside(tokens.root, target);

    const refused = await Promise.all([
      outside(tokens.bob, target),
      outside(tokens.root, target, 'nobody'),
      outside(tokens.root, { ...target, extra: 1 }),
      outside(tokens.root, { botId: target.botId }),
    ]);

    const row = (await audit(tokens.root)).page?.entries.find((entry) => entry.action === 'outside/load');

    await chmod(join(fixture.root, 'hub'), 0o500);

    const unrecorded = await outside(tokens.root, target);

    await chmod(join(fixture.root, 'hub'), 0o700);

    expect(loaded.status).toBe(204);
    expect(refused.map(({ status }) => status)).toEqual([403, 404, 422, 422]);
    expect(row).toMatchObject({
      by: HUB_AUDIT_FIXTURE.admin,
      kind: 'read',
      userId: 'alice',
      botId: target.botId,
      conversationId: 7,
      status: 204,
    });
    expect(unrecorded).toEqual({ status: 503, json: { error: 'audit_unavailable' } });
    expect(fixture.logs.join('')).toContain('Admin loaded outside content in a conversation');
  });

  it('runs the global sync at start once per version, and again after a hub of another version synced', async ({ fixture, tokens }) => {
    const lastStart = async () => ((await audit(tokens.root, '?kind=change')).page?.entries ?? []).find((entry) => entry.by === 'hub start')?.id ?? 0;
    const skipped = () => fixture.logs.join('').split('The global sync at start already ran for this version').length - 1;

    const restart = async (extra: Record<string, string>) => {
      const before = { row: await lastStart(), skips: skipped() };

      await fixture.restartHub(extra);
      await expect.poll(async () => (await lastStart()) > before.row || skipped() > before.skips, { timeout: 30_000 }).toBe(true);
      await sleep(500);

      return (await lastStart()) > before.row ? 'synced' : 'skipped';
    };

    expect(await restart({ HUB_VERSION: 'v1' })).toBe('synced');
    expect(JSON.parse(await readFile(join(fixture.hubData, 'start-sync.json'), 'utf8'))).toEqual({ version: 'v1', row: await lastStart() });
    expect(await restart({ HUB_VERSION: 'v1' })).toBe('skipped');
    expect(await restart({})).toBe('synced');
    expect(await restart({ HUB_VERSION: 'v1' })).toBe('synced');
    expect(await restart({ HUB_VERSION: 'v1' })).toBe('skipped');
    expect(await restart({ HUB_VERSION: 'v2' })).toBe('synced');
  });

  it('pages newest first and filters by admin, person and kind', async ({ tokens }) => {
    await Promise.all(Array.from({ length: 30 }, (_, index) => hubAdminTestWrite(index % 2 === 0 ? tokens.root : tokens.alice, `/admin/api/users/${index % 3 === 0 ? 'bob' : 'alice'}/rpc/routines/list`, {
      body: { json: { botId: crypto.randomUUID() } },
      headers: { 'x-bots-protocol': '1' },
    })));
    await Promise.all(Array.from({ length: 30 }, () => hubAdminTestWrite(tokens.root, '/admin/api/users/bob/rpc/secrets/configure', { body: { json: {} }, headers: { 'x-bots-protocol': '1' } })));

    const first = (await audit(tokens.root)).page;
    const second = (await audit(tokens.root, `?cursor=${String(first?.next)}`)).page;
    const ids = [...first?.entries ?? [], ...second?.entries ?? []].map(({ id }) => id);
    const byAlice = (await audit(tokens.root, `?by=${encodeURIComponent(HUB_AUDIT_FIXTURE.emails.alice.toUpperCase())}`)).page?.entries ?? [];
    const bobReads = (await audit(tokens.root, '?user=bob&kind=read')).page?.entries ?? [];
    const changes = (await audit(tokens.root, '?kind=change')).page?.entries ?? [];

    expect(first?.entries).toHaveLength(50);
    expect(first?.next).toBe(first?.entries.at(-1)?.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(new Set(ids).size).toBe(ids.length);
    expect(byAlice.length).toBeGreaterThanOrEqual(15);
    expect(byAlice.every((entry) => entry.by === HUB_AUDIT_FIXTURE.emails.alice)).toBe(true);
    expect(bobReads.length).toBeGreaterThanOrEqual(10);
    expect(bobReads.every((entry) => entry.userId === 'bob' && entry.kind === 'read')).toBe(true);
    expect(changes.every((entry) => entry.kind === 'change')).toBe(true);
  });
});
