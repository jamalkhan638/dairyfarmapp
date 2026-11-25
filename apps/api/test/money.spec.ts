import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { FARM_SETTINGS_ID, farmToday } from '@dairy/shared';
import { createApp, mutation, newAnimal, resetDb } from './helpers';
import { Phone, login } from './phone';
import { cashBookOf as cashBook, loadFinance } from '../../mobile/src/domain/finance';
import { loadFeed, supplierBalances } from '../../mobile/src/domain/feed';

let app: INestApplication;
let ownerToken: string;
let worker: { id: string; token: string };
let ownerPhone: Phone;
let workerPhone: Phone;
let supplier: string;
let cow: string;
const today = farmToday();

const push = (token: string, ...mutations: object[]) =>
  request(app.getHttpServer()).post('/api/sync/push').set('Authorization', `Bearer ${token}`).send({ mutations }).then((r) => r.body.results as any[]);
const create = (entity: string, data: Record<string, unknown>, recordId: string = randomUUID()) => mutation({ entity: entity as any, op: 'create', recordId, data });

beforeAll(async () => {
  app = await createApp();
  await resetDb(app);
  const setup = await request(app.getHttpServer()).post('/api/auth/setup').send({ setupCode: 'test-setup', name: 'Jamal', username: 'jamal', password: 'secret123' });
  ownerToken = setup.body.accessToken;
  await request(app.getHttpServer()).post('/api/users').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Ali', username: 'ali', password: 'worker123' });
  worker = await login(app, 'ali', 'worker123');
  supplier = randomUUID();
  const a = newAnimal('7');
  cow = a.id;
  await push(ownerToken, create('Supplier', { name: 'Dr. Aslam Vet Store' }, supplier), a.m());
  ownerPhone = await new Phone(app, setup.body.user.id, ownerToken).init();
  workerPhone = await new Phone(app, worker.id, worker.token).init();
});
afterAll(() => app.close());

describe('server rules', () => {
  it('farm settings exist from setup and can be edited, not created or deleted', async () => {
    await ownerPhone.sync();
    const s = (await ownerPhone.repo.get<any>('FarmSettings', FARM_SETTINGS_ID))!.data;
    expect(s.openingCashDate).toBe(today);
    const [u] = await push(ownerToken, mutation({ entity: 'FarmSettings', op: 'update', recordId: FARM_SETTINGS_ID, data: { openingCashPaisa: 10_000_000 }, base: { openingCashPaisa: 0 }, baseVersion: 1 }));
    expect(u.record.openingCashPaisa).toBe(10_000_000);
    const [c] = await push(ownerToken, create('FarmSettings', {}));
    const [d] = await push(ownerToken, mutation({ entity: 'FarmSettings', op: 'delete', recordId: FARM_SETTINGS_ID, baseVersion: 2, base: {} }));
    expect([c.status, d.errorCode]).toEqual(['rejected', 'not_deletable']);
  });

  it('an expense paid now to a supplier also records the payment; on credit it adds to what we owe', async () => {
    const payId = randomUUID();
    const [paid] = await push(worker.token, create('Expense', { date: today, category: 'MEDICINE', amountPaisa: 120_000, supplierId: supplier, paymentType: 'CASH', method: 'MOBILE', cashPaymentId: payId, animalId: cow }));
    const [credit] = await push(worker.token, create('Expense', { date: today, category: 'VET', amountPaisa: 300_000, supplierId: supplier, paymentType: 'CREDIT' }));
    const [noSupplierCredit] = await push(worker.token, create('Expense', { date: today, category: 'LABOUR', amountPaisa: 100, paymentType: 'CREDIT' }));
    expect([paid.status, credit.status, noSupplierCredit.status]).toEqual(['applied', 'applied', 'rejected']);
    expect(paid.record.createdById).toBe(worker.id);
    await ownerPhone.sync();
    const feed = await loadFeed(ownerPhone.repo);
    const fin = await loadFinance(ownerPhone.repo);
    const linked = feed.payments.find((p) => p.id === payId)!.data;
    expect(linked).toMatchObject({ amountPaisa: 120_000, method: 'MOBILE', expenseId: paid.record.id });
    const owed = supplierBalances(feed.purchases.map((x) => x.data), feed.payments.map((x) => x.data), fin.expenses.map((x) => x.data)).get(supplier)!;
    expect(owed.balancePaisa).toBe(300_000);

    // The automatic payment follows the expense and can't be removed on its own.
    const [delPay] = await push(ownerToken, mutation({ entity: 'SupplierPayment', op: 'delete', recordId: payId, baseVersion: 1, base: { amountPaisa: 120_000 } }));
    expect(delPay.errorCode).toBe('managed');
    await push(ownerToken, mutation({ entity: 'Expense', op: 'update', recordId: paid.record.id, data: { amountPaisa: 150_000 }, base: { amountPaisa: 120_000 }, baseVersion: 1 }));
    await ownerPhone.sync();
    expect((await loadFeed(ownerPhone.repo)).payments.find((p) => p.id === payId)!.data.amountPaisa).toBe(150_000);
  });

  it('capital entries accept large amounts and check the animal', async () => {
    const [big] = await push(ownerToken, create('CapitalEntry', { date: today, type: 'OWNER_INVESTMENT', amountPaisa: 5_000_000_000 })); // Rs 5 crore
    const [ghost] = await push(ownerToken, create('CapitalEntry', { date: today, type: 'ANIMAL_PURCHASE', amountPaisa: 100, animalId: randomUUID() }));
    expect(big.status).toBe('applied');
    expect(big.record.amountPaisa).toBe(5_000_000_000);
    expect(ghost.errorCode).toBe('not_found');
    await push(ownerToken, mutation({ entity: 'CapitalEntry', op: 'delete', recordId: big.record.id, baseVersion: 1, base: { amountPaisa: 5_000_000_000 } }));
  });

  it('a receipt photo can be attached to an expense', async () => {
    const [e] = await push(worker.token, create('Expense', { date: today, category: 'ELECTRICITY', amountPaisa: 450_000 }));
    const att = randomUUID();
    const [a] = await push(worker.token, create('Attachment', { entity: 'Expense', recordId: e.record.id, contentType: 'image/jpeg', sizeBytes: 3 }, att));
    expect(a.status).toBe('applied');
    const up = await request(app.getHttpServer()).put(`/api/files/${att}`).set('Authorization', `Bearer ${worker.token}`).set('Content-Type', 'image/jpeg').send(Buffer.from([9, 9, 9]));
    expect(up.status).toBe(204);
    const [u] = await push(worker.token, mutation({ entity: 'Expense', op: 'update', recordId: e.record.id, data: { receiptPhotoId: att }, base: { receiptPhotoId: null }, baseVersion: 1 }));
    expect(u.record.receiptPhotoId).toBe(att);
  });
});

describe('two phones', () => {
  it('money entered offline on two phones gives the same cash balance on both', async () => {
    await ownerPhone.sync();
    await workerPhone.sync();
    const before = cashBook(await loadFinance(ownerPhone.repo)).balance;
    ownerPhone.online = workerPhone.online = false;
    await ownerPhone.repo.create('CapitalEntry', ownerPhone.userId, randomUUID(), { date: today, type: 'EQUIPMENT', amountPaisa: 4_500_000, description: 'Chaff cutter', method: 'CASH', animalId: null, receiptPhotoId: null });
    await workerPhone.repo.create('Expense', workerPhone.userId, randomUUID(), { date: today, category: 'LABOUR', amountPaisa: 2_500_000, description: 'Monthly wage', supplierId: null, paymentType: 'CASH', method: 'CASH', cashPaymentId: null, animalId: null, receiptPhotoId: null });
    // Offline, each phone already shows its own change in the balance.
    expect(cashBook(await loadFinance(ownerPhone.repo)).balance).toBe(before - 4_500_000);
    ownerPhone.online = workerPhone.online = true;
    for (const p of [ownerPhone, workerPhone, ownerPhone]) await p.sync();
    for (const p of [ownerPhone, workerPhone]) {
      expect(cashBook(await loadFinance(p.repo)).balance).toBe(before - 4_500_000 - 2_500_000);
      expect(p.engine.status).toMatchObject({ pending: 0, conflicts: 0, rejected: 0 });
    }
  });

  it('two phones change the opening cash offline: conflict, owner decides', async () => {
    ownerPhone.online = workerPhone.online = false;
    await ownerPhone.repo.update('FarmSettings', ownerPhone.userId, FARM_SETTINGS_ID, { openingCashPaisa: 7_000_000 });
    await workerPhone.repo.update('FarmSettings', workerPhone.userId, FARM_SETTINGS_ID, { openingCashPaisa: 6_000_000 });
    ownerPhone.online = workerPhone.online = true;
    await ownerPhone.sync();
    await workerPhone.sync();
    expect(workerPhone.engine.status.conflicts).toBe(1);
    expect((await workerPhone.repo.get<any>('FarmSettings', FARM_SETTINGS_ID))!.data.openingCashPaisa).toBe(7_000_000);
  });
});
