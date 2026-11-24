/**
 * End-to-end offline scenarios: two simulated phones run the real mobile sync engine
 * (apps/mobile/src/sync) against the real API and a real Postgres database.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { emptyPermissionMap } from '@dairy/shared';
import { createApp, resetDb } from './helpers';
import { Phone, login as loginAs } from './phone';
import { addAnimal, changeStatus, loadAnimals } from '../../mobile/src/domain/animals';

const login = (u: string, p: string) => loginAs(app, u, p);

let app: INestApplication;

let owner: Phone;
let worker: Phone;

beforeAll(async () => {
  app = await createApp();
  await resetDb(app);
  const setup = await request(app.getHttpServer()).post('/api/auth/setup').send({ setupCode: 'test-setup', name: 'Jamal', username: 'jamal', password: 'secret123' });
  const perms = emptyPermissionMap();
  perms.animals = { view: true, add: true, edit: true, delete: false };
  await request(app.getHttpServer()).post('/api/users').set('Authorization', `Bearer ${setup.body.accessToken}`).send({ name: 'Ali', username: 'ali', password: 'worker123', permissions: perms });
  const w = await login('ali', 'worker123');
  owner = await new Phone(app, setup.body.user.id, setup.body.accessToken).init();
  worker = await new Phone(app, w.id, w.token).init();
});

afterAll(() => app.close());

it('entries made offline are kept, then sent once when internet returns', async () => {
  worker.online = false;
  await addAnimal(worker.repo, worker.userId, randomUUID, { tag: '101', name: 'Rani', sex: 'FEMALE', birthDateEstimated: false }, { status: 'MILKING', date: '2026-11-01' });
  await worker.sync();
  expect(worker.engine.status.phase).toBe('offline');
  expect(worker.engine.status.pending).toBe(1);
  const local = await worker.animal('101');
  expect(local?.record.syncState).toBe('pending');
  expect(local?.status).toBe('MILKING');

  worker.online = true;
  await worker.sync();
  await worker.sync(); // a second sync must not create anything twice
  expect(worker.engine.status).toMatchObject({ phase: 'idle', pending: 0, conflicts: 0 });
  const synced = await worker.animal('101');
  expect(synced?.record.syncState).toBe('synced');
  expect(synced?.animal.version).toBe(1);
  expect(synced?.history).toHaveLength(1); // initial status entry made by the server

  await owner.sync();
  const seen = await owner.animal('101');
  expect(seen?.animal.name).toBe('Rani');
  expect(seen?.animal.createdById).toBe(worker.userId);
});

it('both phones edit different fields offline: both edits survive', async () => {
  owner.online = worker.online = false;
  const id = (await owner.animal('101'))!.animal.id;
  await owner.repo.update('Animal', owner.userId, id, { breed: 'Sahiwal' });
  await worker.repo.update('Animal', worker.userId, id, { notes: 'Gives more milk in winter' });
  owner.online = worker.online = true;
  await owner.sync();
  await worker.sync();
  await owner.sync();
  for (const p of [owner, worker]) {
    const a = (await p.animal('101'))!.animal;
    expect(a).toMatchObject({ breed: 'Sahiwal', notes: 'Gives more milk in winter', version: 3 });
  }
});

it('both phones edit the same field offline: conflict is shown, then resolved by the user', async () => {
  owner.online = worker.online = false;
  const id = (await owner.animal('101'))!.animal.id;
  await owner.repo.update('Animal', owner.userId, id, { name: 'Rani Sahiwal' });
  await worker.repo.update('Animal', worker.userId, id, { name: 'Raani' });
  owner.online = worker.online = true;
  await owner.sync();
  await worker.sync();

  expect(worker.engine.status.conflicts).toBe(1);
  const view = (await worker.animal('101'))!;
  expect(view.record.syncState).toBe('conflict');
  expect(view.animal.name).toBe('Rani Sahiwal'); // the saved value is shown, not overwritten

  // Later edits to the same animal wait until the conflict is resolved.
  await worker.repo.update('Animal', worker.userId, id, { breed: 'Sahiwal cross' });
  await worker.sync();
  expect(worker.engine.status.pending).toBe(1);

  const conflicts = (await worker.repo.list<any>('SyncConflict')).filter((c) => c.data.status === 'OPEN');
  expect(conflicts).toHaveLength(1);
  const c = conflicts[0].data;
  expect(c.mine.data).toEqual({ name: 'Raani' });
  expect(c.theirs.name).toBe('Rani Sahiwal');

  await worker.repo.resolveConflict(worker.userId, c.id, { action: 'use_mine', theirsVersion: c.theirsVersion });
  await worker.sync();
  expect(worker.engine.status).toMatchObject({ conflicts: 0, pending: 0 });
  await owner.sync();
  for (const p of [owner, worker]) {
    expect((await p.animal('101'))!.animal).toMatchObject({ name: 'Raani', breed: 'Sahiwal cross' });
  }
});

it('two phones add the same tag offline: the second becomes a duplicate to decide on', async () => {
  owner.online = worker.online = false;
  await addAnimal(owner.repo, owner.userId, randomUUID, { tag: '205', sex: 'FEMALE', birthDateEstimated: false }, { status: 'DRY', date: '2026-11-02' });
  await addAnimal(worker.repo, worker.userId, randomUUID, { tag: '205', name: 'Duplicate', sex: 'FEMALE', birthDateEstimated: false }, { status: 'MILKING', date: '2026-11-02' });
  owner.online = worker.online = true;
  await owner.sync();
  await worker.sync();
  expect(worker.engine.status.conflicts).toBe(1);
  const c = (await worker.repo.list<any>('SyncConflict')).find((x) => x.data.status === 'OPEN')!.data;
  expect(c.type).toBe('DUPLICATE');

  // Keep the one already saved: the phone's copy disappears, one animal 205 remains.
  await worker.repo.resolveConflict(worker.userId, c.id, { action: 'keep_theirs' });
  await worker.sync();
  const all205 = (await loadAnimals(worker.repo)).filter((a) => a.animal.tag === '205');
  expect(all205).toHaveLength(1);
  expect(all205[0].animal.name).toBeNull();
  expect(worker.engine.status).toMatchObject({ conflicts: 0, pending: 0 });
});

it('rejected changes stay visible until the user discards them', async () => {
  const id = (await worker.animal('101'))!.animal.id;
  await worker.repo.remove('Animal', worker.userId, id); // worker has no delete permission
  await worker.sync();
  expect(worker.engine.status.rejected).toBe(1);
  const v = (await loadAnimals(worker.repo)).find((a) => a.animal.id === id)!;
  expect(v.record.syncState).toBe('rejected');
  expect(v.animal.deletedAt).toBeNull(); // still shown: the server did not delete it

  const row = (await worker.repo.outbox()).find((r) => r.status === 'rejected')!;
  expect(row.error_code).toBe('forbidden');
  await worker.repo.discard(row.seq);
  await worker.engine.refresh();
  expect(worker.engine.status.rejected).toBe(0);
  expect((await worker.animal('101'))!.record.syncState).toBe('synced');
});

it('status changes made offline show immediately and sync to the other phone', async () => {
  worker.online = false;
  const id = (await worker.animal('101'))!.animal.id;
  await changeStatus(worker.repo, worker.userId, randomUUID, id, 'DRY', '2026-11-20', 'Pregnant, dried off');
  expect((await worker.animal('101'))!.status).toBe('DRY');
  worker.online = true;
  await worker.sync();
  await owner.sync();
  const o = (await owner.animal('101'))!;
  expect(o.status).toBe('DRY');
  expect(o.animal.status).toBe('DRY');
  expect(o.history.map((h) => h.status)).toEqual(['DRY', 'MILKING']);
});

it('a response lost on the way back does not create a duplicate', async () => {
  // Simulate: the server saves the change but the phone never hears back.
  const lostPhone = await new Phone(app, worker.userId, (await login('ali', 'worker123')).token).init();
  await addAnimal(lostPhone.repo, lostPhone.userId, randomUUID, { tag: '309', sex: 'FEMALE', birthDateEstimated: false }, { status: 'MILKING', date: '2026-11-03' });
  const [row] = await lostPhone.repo.sendable(lostPhone.userId);
  const token = (await login('ali', 'worker123')).token;
  await request(app.getHttpServer()).post('/api/sync/push').set('Authorization', `Bearer ${token}`).send({ mutations: [lostPhone.repo.toMutation(row)] });
  // The phone still thinks it is unsent and sends it again.
  await lostPhone.sync();
  expect(lostPhone.engine.status).toMatchObject({ pending: 0, conflicts: 0, rejected: 0 });
  await owner.sync();
  expect((await loadAnimals(owner.repo)).filter((a) => a.animal.tag === '309')).toHaveLength(1);
});
