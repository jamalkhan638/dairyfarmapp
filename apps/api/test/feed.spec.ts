import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { farmToday } from '@dairy/shared';
import { createApp, mutation, newAnimal, resetDb } from './helpers';
import { Phone, login } from './phone';
import { loadFeed, stockByItem, supplierBalances } from '../../mobile/src/domain/feed';

let app: INestApplication;
let ownerToken: string;
let worker: { id: string; token: string };
let ownerPhone: Phone;
let workerPhone: Phone;
let wanda: string;
let supplier: string;
let cowA: string;
let cowB: string;
const today = farmToday();

const push = (token: string, ...mutations: object[]) =>
  request(app.getHttpServer()).post('/api/sync/push').set('Authorization', `Bearer ${token}`).send({ mutations }).then((r) => r.body.results as any[]);
const create = (entity: string, data: Record<string, unknown>, recordId: string = randomUUID()) => mutation({ entity: entity as any, op: 'create', recordId, data });

beforeAll(async () => {
  app = await createApp();
  await resetDb(app);
  const setup = await request(app.getHttpServer()).post('/api/auth/setup').send({ setupCode: 'test-setup', name: 'Jamal', username: 'jamal', password: 'secret123' });
  ownerToken = setup.body.accessToken;
  // No permissions given: new users get full access.
  const u = await request(app.getHttpServer()).post('/api/users').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Ali', username: 'ali', password: 'worker123' });
  expect(u.body.permissions.feed).toEqual({ view: true, add: true, edit: true, delete: true });
  worker = await login(app, 'ali', 'worker123');

  wanda = randomUUID();
  supplier = randomUUID();
  const a = newAnimal('1');
  const b = newAnimal('2');
  cowA = a.id;
  cowB = b.id;
  const r = await push(ownerToken,
    create('FeedItem', { name: 'Wanda', category: 'CONCENTRATE', bagWeightGrams: 50_000 }, wanda),
    create('Supplier', { name: 'Haji Feeds' }, supplier),
    a.m(), b.m(),
  );
  expect(r.map((x) => x.status)).toEqual(['applied', 'applied', 'applied', 'applied']);
  ownerPhone = await new Phone(app, setup.body.user.id, ownerToken).init();
  workerPhone = await new Phone(app, worker.id, worker.token).init();
});
afterAll(() => app.close());

describe('server rules', () => {
  it('a purchase stores the price per kg; a cash purchase records its payment', async () => {
    const payId = randomUUID();
    const [p] = await push(ownerToken, create('FeedPurchase', { feedItemId: wanda, supplierId: supplier, date: today, quantityGrams: 100_000, bags: 2, totalPaisa: 900_000, paymentType: 'CASH', cashPaymentId: payId, costPerKgPaisa: 1 }));
    expect(p.status).toBe('applied');
    expect(p.record.costPerKgPaisa).toBe(9000); // Rs 9,000 / 100 kg = Rs 90/kg (phone value ignored)
    await ownerPhone.sync();
    const f = await loadFeed(ownerPhone.repo);
    expect(f.payments.find((x) => x.id === payId)!.data).toMatchObject({ amountPaisa: 900_000, purchaseId: p.record.id });
    expect(supplierBalances(f.purchases.map((x) => x.data), f.payments.map((x) => x.data)).get(supplier)!.balancePaisa).toBe(0);

    // Correcting the total corrects the payment; the payment can't be edited on its own.
    await push(ownerToken, mutation({ entity: 'FeedPurchase', op: 'update', recordId: p.record.id, data: { totalPaisa: 950_000 }, base: { totalPaisa: 900_000 }, baseVersion: 1 }));
    const [edit] = await push(ownerToken, mutation({ entity: 'SupplierPayment', op: 'update', recordId: payId, data: { amountPaisa: 1 }, base: { amountPaisa: 950_000 }, baseVersion: 2 }));
    expect(edit.errorCode).toBe('managed');
    await ownerPhone.sync();
    const g = await loadFeed(ownerPhone.repo);
    expect(g.payments.find((x) => x.id === payId)!.data.amountPaisa).toBe(950_000);
    expect(g.purchases.find((x) => x.id === p.record.id)!.data.costPerKgPaisa).toBe(9500);
  });

  it('credit purchases need a supplier; cash at the market does not', async () => {
    const [credit] = await push(ownerToken, create('FeedPurchase', { feedItemId: wanda, date: today, quantityGrams: 1000, totalPaisa: 10_000, paymentType: 'CREDIT' }));
    const [market] = await push(ownerToken, create('FeedPurchase', { feedItemId: wanda, date: today, quantityGrams: 1000, totalPaisa: 10_000, paymentType: 'CASH' }));
    expect(credit.status).toBe('rejected');
    expect(market.status).toBe('applied');
    expect(market.record.cashPaymentId).toBeNull();
  });

  it('feeding checks the animals and needs some kg', async () => {
    const [ok] = await push(worker.token, create('FeedConsumption', { feedItemId: wanda, date: today, quantityGrams: 8000, wastedGrams: 500, animalIds: [cowA, cowB, cowA] }));
    expect(ok.status).toBe('applied');
    expect(ok.record.animalIds).toEqual([cowA, cowB]); // duplicates removed
    expect(ok.record.createdById).toBe(worker.id);
    const [none] = await push(worker.token, create('FeedConsumption', { feedItemId: wanda, date: today, quantityGrams: 0, wastedGrams: 0, animalIds: [cowA] }));
    const [ghost] = await push(worker.token, create('FeedConsumption', { feedItemId: wanda, date: today, quantityGrams: 1000, animalIds: [randomUUID()] }));
    expect([none.status, ghost.status]).toEqual(['rejected', 'rejected']);
  });

  it('names are unique and used items/suppliers cannot be deleted', async () => {
    const [dup] = await push(worker.token, create('FeedItem', { name: 'wanda', category: 'CONCENTRATE' }));
    expect(dup.conflictType).toBe('DUPLICATE');
    const [del] = await push(ownerToken, mutation({ entity: 'FeedItem', op: 'delete', recordId: wanda, baseVersion: 1, base: { name: 'Wanda' } }));
    const [delS] = await push(ownerToken, mutation({ entity: 'Supplier', op: 'delete', recordId: supplier, baseVersion: 1, base: { name: 'Haji Feeds' } }));
    expect([del.errorCode, delS.errorCode]).toEqual(['in_use', 'in_use']);
  });
});

describe('two phones', () => {
  it('purchases, feeding and a supplier payment made offline on two phones add up correctly', async () => {
    await ownerPhone.sync();
    await workerPhone.sync();
    const before = await loadFeed(ownerPhone.repo);
    const stock0 = stockByItem(before.purchases.map((x) => x.data), before.consumptions.map((x) => x.data), before.adjustments.map((x) => x.data)).get(wanda)!;
    const owed0 = supplierBalances(before.purchases.map((x) => x.data), before.payments.map((x) => x.data)).get(supplier)!.balancePaisa;

    ownerPhone.online = workerPhone.online = false;
    await ownerPhone.repo.create('FeedPurchase', ownerPhone.userId, randomUUID(), { feedItemId: wanda, supplierId: supplier, date: today, quantityGrams: 150_000, bags: 3, totalPaisa: 1_350_000, paymentType: 'CREDIT', cashPaymentId: null, note: null });
    await workerPhone.repo.create('FeedConsumption', workerPhone.userId, randomUUID(), { feedItemId: wanda, date: today, quantityGrams: 12_000, wastedGrams: 1000, animalIds: [cowA, cowB], note: null });
    await workerPhone.repo.create('SupplierPayment', workerPhone.userId, randomUUID(), { supplierId: supplier, date: today, amountPaisa: 500_000, method: 'MOBILE', note: null });
    ownerPhone.online = workerPhone.online = true;
    for (const p of [ownerPhone, workerPhone, ownerPhone, workerPhone]) await p.sync();

    for (const p of [ownerPhone, workerPhone]) {
      const f = await loadFeed(p.repo);
      const stock = stockByItem(f.purchases.map((x) => x.data), f.consumptions.map((x) => x.data), f.adjustments.map((x) => x.data)).get(wanda)!;
      expect(stock).toBe(stock0 + 150_000 - 13_000);
      expect(supplierBalances(f.purchases.map((x) => x.data), f.payments.map((x) => x.data)).get(supplier)!.balancePaisa).toBe(owed0 + 1_350_000 - 500_000);
      expect(p.engine.status).toMatchObject({ pending: 0, conflicts: 0, rejected: 0 });
    }
  });

  it('both phones correct the same purchase total offline: conflict, nothing overwritten', async () => {
    const f = await loadFeed(ownerPhone.repo);
    const p = f.purchases.find((x) => x.data.quantityGrams === 150_000)!;
    ownerPhone.online = workerPhone.online = false;
    await ownerPhone.repo.update('FeedPurchase', ownerPhone.userId, p.id, { totalPaisa: 1_400_000 });
    await workerPhone.repo.update('FeedPurchase', workerPhone.userId, p.id, { totalPaisa: 1_300_000 });
    ownerPhone.online = workerPhone.online = true;
    await ownerPhone.sync();
    await workerPhone.sync();
    expect(workerPhone.engine.status.conflicts).toBe(1);
    const shown = (await workerPhone.repo.get<any>('FeedPurchase', p.id))!.data;
    expect(shown.totalPaisa).toBe(1_400_000);
  });
});
