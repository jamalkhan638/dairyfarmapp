import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { fullPermissionMap, emptyPermissionMap } from '@dairy/shared';
import { client, createApp, mutation, newAnimal, resetDb } from './helpers';

let app: INestApplication;
let ownerToken: string;
let ownerId: string;
let workerToken: string;
let workerId: string;

const push = (token: string, ...mutations: object[]) =>
  client(app, token).post('/api/sync/push', { mutations }).then((r) => {
    expect(r.status).toBe(200);
    return r.body.results as any[];
  });

beforeAll(async () => {
  app = await createApp();
  await resetDb(app);
  const setup = await client(app).post('/api/auth/setup', { setupCode: 'test-setup', name: 'Jamal', username: 'jamal', password: 'secret123' });
  expect(setup.status).toBe(201);
  ownerToken = setup.body.accessToken;
  ownerId = setup.body.user.id;

  const perms = emptyPermissionMap();
  perms.animals = { view: true, add: true, edit: true, delete: false };
  const w = await client(app, ownerToken).post('/api/users', { name: 'Ali', username: 'ali', password: 'worker123', permissions: perms });
  expect(w.status).toBe(201);
  workerId = w.body.id;
  const login = await client(app).post('/api/auth/login', { username: 'Ali', password: 'worker123' });
  expect(login.status).toBe(200);
  workerToken = login.body.accessToken;
});

afterAll(() => app.close());

describe('auth & permissions', () => {
  it('setup cannot be repeated', async () => {
    const r = await client(app).post('/api/auth/setup', { setupCode: 'test-setup', name: 'X', username: 'xxx', password: 'secret123' });
    expect(r.status).toBe(409);
  });

  it('rejects requests without a login', async () => {
    expect((await client(app).get('/api/sync/pull')).status).toBe(401);
  });

  it('workers cannot manage users', async () => {
    expect((await client(app, workerToken).get('/api/users')).status).toBe(403);
  });

  it('refresh tokens rotate', async () => {
    const login = await client(app).post('/api/auth/login', { username: 'ali', password: 'worker123' });
    const r1 = await client(app).post('/api/auth/refresh', { refreshToken: login.body.refreshToken });
    expect(r1.status).toBe(200);
    const r2 = await client(app).post('/api/auth/refresh', { refreshToken: login.body.refreshToken });
    expect(r2.status).toBe(401);
  });

  it('backend rejects a delete the worker has no permission for', async () => {
    const a = newAnimal('P-1');
    expect((await push(workerToken, a.m()))[0].status).toBe('applied');
    const [r] = await push(workerToken, mutation({ entity: 'Animal', op: 'delete', recordId: a.id, baseVersion: 1, base: { tag: 'P-1' } }));
    expect(r.status).toBe('rejected');
    expect(r.errorCode).toBe('forbidden');
  });
});

describe('record ownership', () => {
  it('createdBy comes from the login, not from the phone', async () => {
    const a = newAnimal('OWN-1', { createdById: ownerId, updatedById: ownerId });
    const [r] = await push(workerToken, a.m());
    expect(r.status).toBe('applied');
    expect(r.record.createdById).toBe(workerId);
    expect(r.record.updatedById).toBe(workerId);

    // The owner edits it: creator stays the worker, last updater becomes the owner.
    const [u] = await push(ownerToken, mutation({ entity: 'Animal', op: 'update', recordId: a.id, data: { name: 'Lali' }, base: { name: null }, baseVersion: 1 }));
    expect(u.status).toBe('applied');
    expect(u.record.createdById).toBe(workerId);
    expect(u.record.updatedById).toBe(ownerId);
    expect(u.record.version).toBe(2);

    const h = await client(app, ownerToken).get(`/api/history/Animal/${a.id}`);
    expect(h.body.map((e: any) => [e.action, e.userName])).toEqual([['CREATE', 'Ali'], ['UPDATE', 'Jamal']]);
    expect(h.body[1].changes).toEqual({ name: { from: null, to: 'Lali' } });
  });
});

describe('duplicate prevention', () => {
  it('re-sending the same change applies it only once', async () => {
    const a = newAnimal('DUP-1');
    const m = a.m();
    const [first] = await push(workerToken, m);
    const [second] = await push(workerToken, m);
    expect(first.status).toBe('applied');
    expect(second).toEqual(first);
    const h = await client(app, ownerToken).get(`/api/history/Animal/${a.id}`);
    expect(h.body).toHaveLength(1);
  });

  it('two phones adding the same tag gives a DUPLICATE conflict, not two animals', async () => {
    const [a] = await push(ownerToken, newAnimal('Tag-7').m());
    expect(a.status).toBe('applied');
    const b = newAnimal('tag-7'); // different case, same tag
    const [r] = await push(workerToken, b.m());
    expect(r.status).toBe('conflict');
    expect(r.conflictType).toBe('DUPLICATE');
    expect(r.record.tag).toBe('Tag-7');

    // Later changes to the blocked record wait in the same batch and in later batches.
    const [blocked] = await push(workerToken, mutation({ entity: 'Animal', op: 'update', recordId: b.id, data: { name: 'x' }, baseVersion: 1 }));
    expect(blocked.status).toBe('blocked');

    // Resolve by saving it under a different tag.
    const [res] = await push(workerToken, mutation({ entity: 'SyncConflict', op: 'resolve', recordId: r.conflictId, data: { action: 'custom', values: { tag: 'Tag-8' } } }));
    expect(res.status).toBe('applied');
    expect(res.record.status).toBe('RESOLVED');
    const pulled = await client(app, ownerToken).get('/api/sync/pull?cursor=0');
    const tags = pulled.body.changes.filter((c: any) => c.entity === 'Animal').map((c: any) => c.record.tag);
    expect(tags).toEqual(expect.arrayContaining(['Tag-7', 'Tag-8']));
  });
});

describe('conflicting edits', () => {
  it('edits to different fields merge automatically', async () => {
    const a = newAnimal('M-1');
    await push(ownerToken, a.m());
    const [r1] = await push(ownerToken, mutation({ entity: 'Animal', op: 'update', recordId: a.id, data: { name: 'Gori' }, base: { name: null }, baseVersion: 1 }));
    // Worker was offline and still saw version 1.
    const [r2] = await push(workerToken, mutation({ entity: 'Animal', op: 'update', recordId: a.id, data: { breed: 'Sahiwal' }, base: { breed: null }, baseVersion: 1 }));
    expect(r1.status).toBe('applied');
    expect(r2.status).toBe('applied');
    expect(r2.record).toMatchObject({ name: 'Gori', breed: 'Sahiwal', version: 3 });
  });

  it('edits to the same field become a conflict; nothing is overwritten', async () => {
    const a = newAnimal('C-1');
    await push(ownerToken, a.m());
    await push(ownerToken, mutation({ entity: 'Animal', op: 'update', recordId: a.id, data: { breed: 'Cholistani' }, base: { breed: null }, baseVersion: 1 }));
    const [r] = await push(workerToken, mutation({ entity: 'Animal', op: 'update', recordId: a.id, data: { breed: 'Sahiwal' }, base: { breed: null }, baseVersion: 1 }));
    expect(r.status).toBe('conflict');
    expect(r.conflictType).toBe('EDIT');
    expect(r.record.breed).toBe('Cholistani');

    // Owner sees the conflict in their download.
    const pulled = await client(app, ownerToken).get('/api/sync/pull?cursor=0');
    expect(pulled.body.changes.some((c: any) => c.entity === 'SyncConflict' && c.record.id === r.conflictId)).toBe(true);

    // Resolving with a stale version is refused and the conflict shows the newest copy.
    await push(ownerToken, mutation({ entity: 'Animal', op: 'update', recordId: a.id, data: { notes: 'checked' }, base: { notes: null }, baseVersion: 2 }));
    const [stale] = await push(workerToken, mutation({ entity: 'SyncConflict', op: 'resolve', recordId: r.conflictId, data: { action: 'use_mine', theirsVersion: 2 } }));
    expect(stale.status).toBe('conflict');
    expect(stale.record.version).toBe(3);

    const [ok] = await push(workerToken, mutation({ entity: 'SyncConflict', op: 'resolve', recordId: r.conflictId, data: { action: 'use_mine', theirsVersion: 3 } }));
    expect(ok.status).toBe('applied');
    const h = await client(app, ownerToken).get(`/api/history/Animal/${a.id}`);
    const last = h.body[h.body.length - 1];
    expect(last).toMatchObject({ action: 'UPDATE', userName: 'Ali', changes: { breed: { from: 'Cholistani', to: 'Sahiwal' } } });
  });

  it('deleting a record someone else edited is a conflict', async () => {
    const a = newAnimal('D-1');
    await push(ownerToken, a.m());
    await push(workerToken, mutation({ entity: 'Animal', op: 'update', recordId: a.id, data: { name: 'Bholi' }, base: { name: null }, baseVersion: 1 }));
    const [r] = await push(ownerToken, mutation({ entity: 'Animal', op: 'delete', recordId: a.id, baseVersion: 1, base: { tag: 'D-1', name: null } }));
    expect(r.status).toBe('conflict');
    expect(r.conflictType).toBe('DELETE_EDITED');
  });

  it('editing a deleted record is a conflict', async () => {
    const a = newAnimal('E-1');
    await push(ownerToken, a.m());
    await push(ownerToken, mutation({ entity: 'Animal', op: 'delete', recordId: a.id, baseVersion: 1, base: { tag: 'E-1' } }));
    const [r] = await push(workerToken, mutation({ entity: 'Animal', op: 'update', recordId: a.id, data: { name: 'x' }, base: { name: null }, baseVersion: 1 }));
    expect(r.status).toBe('conflict');
    expect(r.conflictType).toBe('EDIT_DELETED');
  });
});

describe('animal status history', () => {
  it('status follows the latest status change by date', async () => {
    const a = newAnimal('S-1');
    await push(workerToken, a.m());
    const dry = mutation({ entity: 'AnimalStatusChange', op: 'create', recordId: randomUUID(), data: { animalId: a.id, status: 'DRY', effectiveDate: '2026-11-20' } });
    // An older back-dated entry must not override the newer one.
    const old = mutation({ entity: 'AnimalStatusChange', op: 'create', recordId: randomUUID(), data: { animalId: a.id, status: 'MILKING', effectiveDate: '2026-11-10' } });
    const results = await push(workerToken, dry, old);
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied']);
    const pulled = await client(app, workerToken).get('/api/sync/pull?cursor=0');
    const animal = pulled.body.changes.find((c: any) => c.entity === 'Animal' && c.record.id === a.id).record;
    expect(animal).toMatchObject({ status: 'DRY', statusDate: '2026-11-20' });
  });

  it('status cannot be edited directly', async () => {
    const a = newAnimal('S-2');
    await push(ownerToken, a.m());
    const [r] = await push(ownerToken, mutation({ entity: 'Animal', op: 'update', recordId: a.id, data: { status: 'SOLD' }, baseVersion: 1 }));
    expect(r.status).toBe('applied');
    expect(r.record.status).toBe('MILKING');
  });
});

describe('pull', () => {
  it('only sends modules the user can view, and access changes trigger a new key', async () => {
    const perms = emptyPermissionMap();
    const w = await client(app, ownerToken).post('/api/users', { name: 'Bilal', username: 'bilal', password: 'worker123', permissions: perms });
    const login = await client(app).post('/api/auth/login', { username: 'bilal', password: 'worker123' });
    const token = login.body.accessToken;
    const p1 = await client(app, token).get('/api/sync/pull?cursor=0');
    expect(p1.body.changes.filter((c: any) => c.entity === 'Animal')).toHaveLength(0);
    expect(p1.body.changes.some((c: any) => c.entity === 'User')).toBe(true);

    await client(app, ownerToken).patch(`/api/users/${w.body.id}`, { permissions: { ...perms, animals: { view: true, add: false, edit: false, delete: false } } });
    const p2 = await client(app, token).get('/api/sync/pull?cursor=0');
    expect(p2.body.accessKey).not.toBe(p1.body.accessKey);
    expect(p2.body.changes.filter((c: any) => c.entity === 'Animal').length).toBeGreaterThan(0);
    // Password hashes never leave the server.
    expect(JSON.stringify(p2.body)).not.toContain('passwordHash');
  });

  it('pages through changes with a cursor', async () => {
    const r1 = await client(app, ownerToken).get('/api/sync/pull?cursor=0&limit=3');
    expect(r1.body.hasMore).toBe(true);
    const r2 = await client(app, ownerToken).get(`/api/sync/pull?cursor=${r1.body.cursor}&limit=3`);
    expect(Number(r2.body.cursor)).toBeGreaterThan(Number(r1.body.cursor));
  });
});

describe('photos', () => {
  it('uploads and downloads an animal photo', async () => {
    const a = newAnimal('PH-1');
    await push(workerToken, a.m());
    const attId = randomUUID();
    const [att] = await push(workerToken, mutation({ entity: 'Attachment', op: 'create', recordId: attId, data: { entity: 'Animal', recordId: a.id, contentType: 'image/jpeg', sizeBytes: 4 } }));
    expect(att.status).toBe('applied');
    expect(att.record.storageKey).toBeUndefined();
    const up = await client(app, workerToken).put(`/api/files/${attId}`).set('Content-Type', 'image/jpeg').send(Buffer.from([1, 2, 3, 4]));
    expect(up.status).toBe(204);
    const down = await client(app, ownerToken).get(`/api/files/${attId}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(down.status).toBe(200);
    expect([...down.body]).toEqual([1, 2, 3, 4]);
  });
});

describe('owner safety', () => {
  it('the last owner cannot be disabled', async () => {
    const r = await client(app, ownerToken).patch(`/api/users/${ownerId}`, { active: false });
    expect(r.status).toBe(400);
  });

  it('disabled workers are locked out immediately', async () => {
    const w = await client(app, ownerToken).post('/api/users', { name: 'Temp', username: 'temp', password: 'worker123', permissions: fullPermissionMap() });
    const login = await client(app).post('/api/auth/login', { username: 'temp', password: 'worker123' });
    await client(app, ownerToken).patch(`/api/users/${w.body.id}`, { active: false });
    expect((await client(app, login.body.accessToken).get('/api/auth/me')).status).toBe(401);
  });
});
