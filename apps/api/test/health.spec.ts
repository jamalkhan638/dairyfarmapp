import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { emptyPermissionMap, farmToday } from '@dairy/shared';
import { createApp, mutation, newAnimal, resetDb } from './helpers';
import { Phone, login } from './phone';
import { loadAnimals } from '../../mobile/src/domain/animals';
import { addDays, computeReminders, loadHealth, pregnancy, withdrawalUntil } from '../../mobile/src/domain/health';
import { addHealthEvent, completeReminder, recordCalving } from '../../mobile/src/domain/health-actions';
import { expensesByCategory, loadFinance } from '../../mobile/src/domain/finance';

let app: INestApplication;
let ownerToken: string;
let worker: { id: string; token: string };
let milker: { id: string; token: string };
let ownerPhone: Phone;
let workerPhone: Phone;
let cow: string;
let bull: string;
const today = farmToday();

const push = (token: string, ...mutations: object[]) =>
  request(app.getHttpServer()).post('/api/sync/push').set('Authorization', `Bearer ${token}`).send({ mutations }).then((r) => r.body.results as any[]);
const create = (entity: string, data: Record<string, unknown>, recordId: string = randomUUID()) => mutation({ entity: entity as any, op: 'create', recordId, data });

beforeAll(async () => {
  app = await createApp();
  await resetDb(app);
  const setup = await request(app.getHttpServer()).post('/api/auth/setup').send({ setupCode: 'test-setup', name: 'Jamal', username: 'jamal', password: 'secret123' });
  ownerToken = setup.body.accessToken;
  const auth = { Authorization: `Bearer ${ownerToken}` };
  await request(app.getHttpServer()).post('/api/users').set(auth).send({ name: 'Ali', username: 'ali', password: 'worker123' });
  const perms = emptyPermissionMap();
  perms.milk = { view: true, add: true, edit: true, delete: true };
  await request(app.getHttpServer()).post('/api/users').set(auth).send({ name: 'Milk boy', username: 'milk', password: 'worker123', permissions: perms });
  worker = await login(app, 'ali', 'worker123');
  milker = await login(app, 'milk', 'worker123');
  const a = newAnimal('21');
  const b = newAnimal('B', { sex: 'MALE' });
  cow = a.id;
  bull = b.id;
  await push(ownerToken, a.m(), b.m());
  ownerPhone = await new Phone(app, setup.body.user.id, ownerToken).init();
  workerPhone = await new Phone(app, worker.id, worker.token).init();
});
afterAll(() => app.close());

describe('server rules', () => {
  it('checks dates, animal sex and pregnancy check results', async () => {
    const [badWd] = await push(worker.token, create('HealthEvent', { animalId: cow, date: today, type: 'TREATMENT', title: 'Mastitis', withdrawalEndDate: addDays(today, -1) }));
    const [badNext] = await push(worker.token, create('HealthEvent', { animalId: cow, date: today, type: 'VACCINATION', title: 'FMD', nextDueDate: today }));
    const [bullBreeding] = await push(worker.token, create('BreedingEvent', { animalId: bull, date: today, type: 'HEAT' }));
    const [noResult] = await push(worker.token, create('BreedingEvent', { animalId: cow, date: today, type: 'PREGNANCY_CHECK' }));
    expect([badWd.status, badNext.status, bullBreeding.status, noResult.status]).toEqual(['rejected', 'rejected', 'rejected', 'rejected']);
  });

  it('keeps only the details that belong to the event type', async () => {
    const [h] = await push(worker.token, create('BreedingEvent', { animalId: cow, date: '2026-01-05', type: 'HEAT', result: 'PREGNANT', sire: 'x' }));
    expect(h.record).toMatchObject({ result: null, sire: null, createdById: worker.id });
    await push(worker.token, mutation({ entity: 'BreedingEvent', op: 'delete', recordId: h.record.id, baseVersion: 1, base: {} }));
  });

  it('a milk-only worker can see withdrawal dates (to know which milk not to sell)', async () => {
    const [t] = await push(ownerToken, create('HealthEvent', { animalId: cow, date: today, type: 'TREATMENT', title: 'Mastitis', medicine: 'Antibiotic', withdrawalEndDate: addDays(today, 3) }));
    expect(t.status).toBe('applied');
    const milkPhone = await new Phone(app, milker.id, milker.token).init();
    await milkPhone.sync();
    const h = await loadHealth(milkPhone.repo);
    expect(withdrawalUntil(h.health.map((x) => x.data), cow, today)!.until).toBe(addDays(today, 3));
    const [blocked] = await push(milker.token, create('HealthEvent', { animalId: cow, date: today, type: 'OTHER', title: 'x' }));
    expect(blocked.errorCode).toBe('forbidden');
  });
});

describe('two phones', () => {
  it('insemination → pregnancy check → calving with a new calf, entered offline, ends the same on both phones', async () => {
    await ownerPhone.sync();
    await workerPhone.sync();
    const ins = '2026-01-10';
    workerPhone.online = false;
    await workerPhone.repo.create('BreedingEvent', workerPhone.userId, randomUUID(), { animalId: cow, date: ins, type: 'INSEMINATION', method: 'AI', sire: 'Sahiwal straw 123', technician: 'Livestock dept', notes: null });
    await workerPhone.repo.create('BreedingEvent', workerPhone.userId, randomUUID(), { animalId: cow, date: '2026-03-12', type: 'PREGNANCY_CHECK', result: 'PREGNANT', notes: null });
    let h = await loadHealth(workerPhone.repo);
    expect(pregnancy(h.breeding.map((b) => b.data), cow, h.settings)).toMatchObject({ state: 'PREGNANT', expectedCalving: addDays(ins, 283) });

    const { calfId } = await recordCalving(workerPhone.repo, workerPhone.userId, randomUUID, { motherId: cow, date: '2026-10-19', notes: null, calf: { tag: '21-C1', sex: 'FEMALE' }, calfSexOnly: null, motherStartsMilking: true });
    workerPhone.online = true;
    await workerPhone.sync();
    await ownerPhone.sync();
    expect(workerPhone.engine.status).toMatchObject({ pending: 0, conflicts: 0, rejected: 0 });

    for (const p of [ownerPhone, workerPhone]) {
      const animals = await loadAnimals(p.repo);
      const calf = animals.find((a) => a.animal.id === calfId)!;
      expect(calf.animal).toMatchObject({ tag: '21-C1', motherId: cow, birthDate: '2026-10-19' });
      expect(calf.status).toBe('YOUNG');
      const hh = await loadHealth(p.repo);
      expect(pregnancy(hh.breeding.map((b) => b.data), cow, hh.settings).state).toBe('OPEN');
      const calving = hh.breeding.find((b) => b.data.type === 'CALVING')!.data;
      expect(calving.calfId).toBe(calfId);
    }
  });

  it('a health visit with a cost is one expense for that cow (not counted twice)', async () => {
    await addHealthEvent(workerPhone.repo, workerPhone.userId, randomUUID, {
      animalId: cow, date: today, type: 'VACCINATION', title: 'FMD', medicine: null, dose: null, vetName: 'Dr. Aslam', withdrawalEndDate: null, nextDueDate: addDays(today, 180), notes: null,
    }, { amountPaisa: 50_000, category: 'VET' });
    await workerPhone.sync();
    await ownerPhone.sync();
    const f = await loadFinance(ownerPhone.repo);
    const vet = f.expenses.filter((e) => e.data.animalId === cow && e.data.category === 'VET');
    expect(vet).toHaveLength(1);
    expect(expensesByCategory(f.expenses.map((e) => e.data), today, today).by.VET).toBe(50_000);
    const h = await loadHealth(ownerPhone.repo);
    expect(h.health.find((x) => x.data.title === 'FMD')!.data.expenseId).toBe(vet[0].id);
  });

  it('marking an automatic reminder done on one phone hides it on the other', async () => {
    const animals = await loadAnimals(ownerPhone.repo);
    let h = await loadHealth(ownerPhone.repo);
    const plain = { health: h.health.map((x) => x.data), breeding: h.breeding.map((x) => x.data), reminders: h.reminders.map((x) => x.data), settings: h.settings };
    const next = computeReminders(animals, plain, today).find((r) => r.kind === 'NEXT_DUE')!;
    expect(next.detail).toBe('FMD');
    await completeReminder(ownerPhone.repo, ownerPhone.userId, randomUUID, { ...next, title: 'FMD' });
    await ownerPhone.sync();
    await workerPhone.sync();
    h = await loadHealth(workerPhone.repo);
    const after = computeReminders(await loadAnimals(workerPhone.repo), { health: h.health.map((x) => x.data), breeding: h.breeding.map((x) => x.data), reminders: h.reminders.map((x) => x.data), settings: h.settings }, today);
    expect(after.find((r) => r.key === next.key)).toBeUndefined();
  });
});
