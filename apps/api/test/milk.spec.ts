import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { emptyPermissionMap, farmToday } from '@dairy/shared';
import { createApp, mutation, newAnimal, resetDb } from './helpers';
import { Phone, login } from './phone';
import { loadMilk, saveMilkSession, summarizeDay } from '../../mobile/src/domain/milk';
import { loadAnimals } from '../../mobile/src/domain/animals';

let app: INestApplication;
let ownerToken: string;
let milker: { id: string; token: string };
let owner: Phone;
let worker: Phone;
let cowId: string;
let bullId: string;
const today = farmToday();

const push = (token: string, ...mutations: object[]) =>
  request(app.getHttpServer()).post('/api/sync/push').set('Authorization', `Bearer ${token}`).send({ mutations }).then((r) => r.body.results as any[]);

beforeAll(async () => {
  app = await createApp();
  await resetDb(app);
  const setup = await request(app.getHttpServer()).post('/api/auth/setup').send({ setupCode: 'test-setup', name: 'Jamal', username: 'jamal', password: 'secret123' });
  ownerToken = setup.body.accessToken;
  // A worker who may only add milk entries: no access to the Animals section.
  const perms = emptyPermissionMap();
  perms.milk = { view: true, add: true, edit: true, delete: false };
  await request(app.getHttpServer()).post('/api/users').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Ali', username: 'ali', password: 'worker123', permissions: perms });
  milker = await login(app, 'ali', 'worker123');

  const cow = newAnimal('11');
  const bull = newAnimal('B1', { sex: 'MALE' });
  await push(ownerToken, cow.m(), bull.m());
  cowId = cow.id;
  bullId = bull.id;
  owner = await new Phone(app, setup.body.user.id, ownerToken).init();
  worker = await new Phone(app, milker.id, milker.token).init();
  await owner.sync();
  await worker.sync();
});

afterAll(() => app.close());

const milk = (data: Record<string, unknown>) => mutation({ entity: 'MilkRecord', op: 'create', recordId: randomUUID(), data });

describe('server rules', () => {
  it('a milk-only worker can see the cows but cannot change them', async () => {
    expect(await worker.animal('11')).toBeDefined();
    const [r] = await push(milker.token, mutation({ entity: 'Animal', op: 'update', recordId: cowId, data: { name: 'x' }, base: { name: null }, baseVersion: 1 }));
    expect(r.errorCode).toBe('forbidden');
  });

  it('rejects future dates, bulls and impossible amounts', async () => {
    const [future] = await push(milker.token, milk({ animalId: cowId, date: '2999-01-01', session: 'MORNING', quantityMl: 1000 }));
    const [bull] = await push(milker.token, milk({ animalId: bullId, date: today, session: 'MORNING', quantityMl: 1000 }));
    const [huge] = await push(milker.token, milk({ animalId: cowId, date: today, session: 'MORNING', quantityMl: 900_000 }));
    expect([future.status, bull.status, huge.status]).toEqual(['rejected', 'rejected', 'rejected']);
  });

  it('only one entry per cow, date and session', async () => {
    const [a] = await push(milker.token, milk({ animalId: cowId, date: '2026-11-01', session: 'MORNING', quantityMl: 9000 }));
    const [b] = await push(ownerToken, milk({ animalId: cowId, date: '2026-11-01', session: 'MORNING', quantityMl: 9500 }));
    const [evening] = await push(ownerToken, milk({ animalId: cowId, date: '2026-11-01', session: 'EVENING', quantityMl: 7000 }));
    expect(a.status).toBe('applied');
    expect(b.status).toBe('conflict');
    expect(b.conflictType).toBe('DUPLICATE');
    expect(evening.status).toBe('applied');
    // Cow, date and session cannot be changed by editing (only amount and note).
    const [moved] = await push(milker.token, mutation({ entity: 'MilkRecord', op: 'update', recordId: a.record.id, data: { session: 'EVENING', quantityMl: 9100 }, base: { session: 'MORNING', quantityMl: 9000 }, baseVersion: 1 }));
    expect(moved.status).toBe('applied');
    expect(moved.record).toMatchObject({ session: 'MORNING', quantityMl: 9100 });
  });

  it('after deleting an entry, the same cow/session can be entered again', async () => {
    const [a] = await push(ownerToken, milk({ animalId: cowId, date: '2026-11-02', session: 'MORNING', quantityMl: 8000 }));
    await push(ownerToken, mutation({ entity: 'MilkRecord', op: 'delete', recordId: a.record.id, baseVersion: 1, base: { quantityMl: 8000 } }));
    const [b] = await push(ownerToken, milk({ animalId: cowId, date: '2026-11-02', session: 'MORNING', quantityMl: 8200 }));
    expect(b.status).toBe('applied');
  });

  it('records milk usage', async () => {
    const [u] = await push(milker.token, mutation({ entity: 'MilkUsage', op: 'create', recordId: randomUUID(), data: { date: today, type: 'CALF_FED', quantityMl: 2500 } }));
    expect(u.status).toBe('applied');
    const [bad] = await push(milker.token, mutation({ entity: 'MilkUsage', op: 'create', recordId: randomUUID(), data: { date: today, type: 'SOLD', quantityMl: 2500 } }));
    expect(bad.status).toBe('rejected');
  });
});

describe('two phones', () => {
  it('the same milking entered offline on two phones becomes one entry plus a decision', async () => {
    owner.online = worker.online = false;
    const date = '2026-11-03';
    await saveMilkSession(owner.repo, owner.userId, randomUUID, date, 'MORNING', [{ animalId: cowId, ml: 10_000 }], []);
    await saveMilkSession(worker.repo, worker.userId, randomUUID, date, 'MORNING', [{ animalId: cowId, ml: 10_500 }], []);
    owner.online = worker.online = true;
    await owner.sync();
    await worker.sync();
    expect(worker.engine.status.conflicts).toBe(1);

    const c = (await worker.repo.list<any>('SyncConflict')).find((x) => x.data.status === 'OPEN')!.data;
    expect(c.type).toBe('DUPLICATE');
    expect(c.theirs.quantityMl).toBe(10_000);
    // The worker's figure is the correct one: put it on the existing entry.
    await worker.repo.resolveConflict(worker.userId, c.id, { action: 'use_mine', theirsVersion: c.theirsVersion });
    await worker.sync();
    await owner.sync();
    for (const p of [owner, worker]) {
      const { records } = await loadMilk(p.repo);
      const entries = records.filter((r) => r.data.date === date && r.data.session === 'MORNING');
      expect(entries).toHaveLength(1);
      expect(entries[0].data.quantityMl).toBe(10_500);
      expect(entries[0].data.updatedById).toBe(worker.userId);
    }
    expect(worker.engine.status).toMatchObject({ conflicts: 0, pending: 0, rejected: 0 });
  });

  it('daily summary on the phone shows recorded, missing and totals', async () => {
    const date = '2026-11-04';
    worker.online = false;
    await saveMilkSession(worker.repo, worker.userId, randomUUID, date, 'MORNING', [{ animalId: cowId, ml: 9000 }], []);
    const animals = await loadAnimals(worker.repo);
    const { records, usages } = await loadMilk(worker.repo);
    const s = summarizeDay(date, animals, records.map((r) => r.data), usages.map((u) => u.data));
    expect(s).toMatchObject({ producedMl: 9000, expected: 2, recorded: 1 });
    expect(s.missing[0].session).toBe('EVENING');
    worker.online = true;
    await worker.sync();
    expect(worker.engine.status.pending).toBe(0);
  });

  it('editing a saved milking changes the existing entry instead of adding another', async () => {
    const date = '2026-11-04';
    const existing = (await loadMilk(worker.repo)).records;
    const r = await saveMilkSession(worker.repo, worker.userId, randomUUID, date, 'MORNING', [{ animalId: cowId, ml: 9300 }], existing);
    expect(r).toEqual({ added: 0, updated: 1, deleted: 0 });
    await worker.sync();
    await owner.sync();
    const entries = (await loadMilk(owner.repo)).records.filter((x) => x.data.date === date);
    expect(entries.map((e) => e.data.quantityMl)).toEqual([9300]);
  });
});
