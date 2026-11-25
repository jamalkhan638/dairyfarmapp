import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { emptyPermissionMap, farmToday } from '@dairy/shared';
import { createApp, mutation, resetDb } from './helpers';
import { Phone, login } from './phone';
import { balances, loadSales, saveRound } from '../../mobile/src/domain/sales';

let app: INestApplication;
let ownerToken: string;
let seller: { id: string; token: string };
let owner: Phone;
let worker: Phone;
const today = farmToday();

const push = (token: string, ...mutations: object[]) =>
  request(app.getHttpServer()).post('/api/sync/push').set('Authorization', `Bearer ${token}`).send({ mutations }).then((r) => r.body.results as any[]);
const history = (entity: string, id: string) =>
  request(app.getHttpServer()).get(`/api/history/${entity}/${id}`).set('Authorization', `Bearer ${ownerToken}`).then((r) => r.body as any[]);

async function addCustomer(token: string, name: string, ratePaisa = 20000) {
  const id = randomUUID();
  const [c] = await push(token,
    mutation({ entity: 'Customer', op: 'create', recordId: id, data: { name } }),
    mutation({ entity: 'CustomerRate', op: 'create', recordId: randomUUID(), data: { customerId: id, ratePaisaPerLitre: ratePaisa, effectiveFrom: '2026-01-01' } }),
  );
  expect(c.status).toBe('applied');
  return id;
}
const delivery = (data: Record<string, unknown>) => mutation({ entity: 'MilkDelivery', op: 'create', recordId: randomUUID(), data });

beforeAll(async () => {
  app = await createApp();
  await resetDb(app);
  const setup = await request(app.getHttpServer()).post('/api/auth/setup').send({ setupCode: 'test-setup', name: 'Jamal', username: 'jamal', password: 'secret123' });
  ownerToken = setup.body.accessToken;
  const perms = emptyPermissionMap();
  perms.sales = { view: true, add: true, edit: false, delete: false };
  await request(app.getHttpServer()).post('/api/users').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Ali', username: 'ali', password: 'worker123', permissions: perms });
  seller = await login(app, 'ali', 'worker123');
  owner = await new Phone(app, setup.body.user.id, ownerToken).init();
  worker = await new Phone(app, seller.id, seller.token).init();
});
afterAll(() => app.close());

describe('server rules', () => {
  it('the server calculates the amount; a wrong amount from the phone is ignored', async () => {
    const c = await addCustomer(ownerToken, 'Hotel Shabbir', 21000);
    const [d] = await push(ownerToken, delivery({ customerId: c, date: today, session: 'MORNING', quantityMl: 12500, ratePaisaPerLitre: 21000, saleType: 'CREDIT', amountPaisa: 1 }));
    expect(d.status).toBe('applied');
    expect(d.record.amountPaisa).toBe(262500); // 12.5 L × Rs 210 = Rs 2,625
    // Editing litres recalculates the amount and records it in history.
    const [u] = await push(ownerToken, mutation({ entity: 'MilkDelivery', op: 'update', recordId: d.record.id, data: { quantityMl: 10000 }, base: { quantityMl: 12500 }, baseVersion: 1 }));
    expect(u.record.amountPaisa).toBe(210000);
    const h = await history('MilkDelivery', d.record.id);
    expect(h[1].changes).toMatchObject({ quantityMl: { from: 12500, to: 10000 }, amountPaisa: { from: 262500, to: 210000 } });
  });

  it('a cash sale creates its payment; the payment follows edits and deletion of the sale', async () => {
    const c = await addCustomer(ownerToken, 'Walk-in');
    const payId = randomUUID();
    const [d] = await push(ownerToken, delivery({ customerId: c, date: today, session: 'EVENING', quantityMl: 2000, ratePaisaPerLitre: 20000, saleType: 'CASH', cashPaymentId: payId }));
    expect(d.status).toBe('applied');
    await owner.sync();
    let pays = (await loadSales(owner.repo)).payments.filter((p) => p.id === payId);
    expect(pays[0].data).toMatchObject({ amountPaisa: 40000, method: 'CASH', deliveryId: d.record.id });

    // The payment of a cash sale cannot be edited or deleted on its own.
    const [edit] = await push(ownerToken, mutation({ entity: 'CustomerPayment', op: 'update', recordId: payId, data: { amountPaisa: 1 }, base: { amountPaisa: 40000 }, baseVersion: 1 }));
    expect(edit.errorCode).toBe('managed');

    await push(ownerToken, mutation({ entity: 'MilkDelivery', op: 'update', recordId: d.record.id, data: { quantityMl: 3000 }, base: { quantityMl: 2000 }, baseVersion: 1 }));
    await owner.sync();
    pays = (await loadSales(owner.repo)).payments.filter((p) => p.id === payId);
    expect(pays[0].data.amountPaisa).toBe(60000);

    await push(ownerToken, mutation({ entity: 'MilkDelivery', op: 'delete', recordId: d.record.id, baseVersion: 2, base: { quantityMl: 3000 } }));
    await owner.sync();
    const all = await loadSales(owner.repo);
    expect(all.payments.find((p) => p.id === payId)).toBeUndefined(); // deleted with the sale
    expect(balances(all.deliveries.map((x) => x.data), all.payments.map((x) => x.data)).get(c)?.balancePaisa ?? 0).toBe(0);
  });

  it('only one delivery per customer, date and milking', async () => {
    const c = await addCustomer(ownerToken, 'Bashir');
    const [a] = await push(ownerToken, delivery({ customerId: c, date: '2026-11-01', session: 'MORNING', quantityMl: 5000, ratePaisaPerLitre: 20000, saleType: 'CREDIT' }));
    const [b] = await push(seller.token, delivery({ customerId: c, date: '2026-11-01', session: 'MORNING', quantityMl: 5000, ratePaisaPerLitre: 20000, saleType: 'CREDIT' }));
    expect(a.status).toBe('applied');
    expect(b.conflictType).toBe('DUPLICATE');
  });

  it('customer names are unique, and customers with sales cannot be deleted', async () => {
    const c = await addCustomer(ownerToken, 'Rafiq');
    const [dup] = await push(seller.token, mutation({ entity: 'Customer', op: 'create', recordId: randomUUID(), data: { name: 'rafiq' } }));
    expect(dup.conflictType).toBe('DUPLICATE');
    await push(ownerToken, delivery({ customerId: c, date: today, session: 'MORNING', quantityMl: 1000, ratePaisaPerLitre: 20000, saleType: 'CREDIT' }));
    const [del] = await push(ownerToken, mutation({ entity: 'Customer', op: 'delete', recordId: c, baseVersion: 1, base: { name: 'Rafiq' } }));
    expect(del.errorCode).toBe('in_use');
  });

  it('rejects bad values and enforces worker permissions', async () => {
    const c = await addCustomer(ownerToken, 'Test');
    const [future] = await push(seller.token, delivery({ customerId: c, date: '2999-01-01', session: 'MORNING', quantityMl: 1000, ratePaisaPerLitre: 20000, saleType: 'CREDIT' }));
    const [cashNoId] = await push(seller.token, delivery({ customerId: c, date: today, session: 'MORNING', quantityMl: 1000, ratePaisaPerLitre: 20000, saleType: 'CASH' }));
    const [rate] = await push(seller.token, mutation({ entity: 'CustomerRate', op: 'create', recordId: randomUUID(), data: { customerId: c, ratePaisaPerLitre: 25000, effectiveFrom: today } }));
    const [pay] = await push(seller.token, mutation({ entity: 'CustomerPayment', op: 'create', recordId: randomUUID(), data: { customerId: c, date: today, amountPaisa: 50000, method: 'MOBILE' } }));
    expect([future.status, cashNoId.status]).toEqual(['rejected', 'rejected']);
    expect(rate.errorCode).toBe('forbidden'); // changing a rate needs Edit
    expect(pay.status).toBe('applied'); // receiving money needs Add
    expect(pay.record.createdById).toBe(seller.id);
  });
});

describe('two phones', () => {
  it('a delivery round entered offline on two phones: one delivery per customer, one decision', async () => {
    const c1 = await addCustomer(ownerToken, 'Shop 1', 20000);
    const c2 = await addCustomer(ownerToken, 'Shop 2', 19000);
    await owner.sync();
    await worker.sync();
    const date = '2026-11-05';
    owner.online = worker.online = false;
    await saveRound(owner.repo, owner.userId, randomUUID, date, 'MORNING', [
      { customerId: c1, ml: 5000, saleType: 'CREDIT', ratePaisaPerLitre: 20000 },
      { customerId: c2, ml: 3000, saleType: 'CASH', ratePaisaPerLitre: 19000 },
    ], []);
    await saveRound(worker.repo, worker.userId, randomUUID, date, 'MORNING', [{ customerId: c1, ml: 5500, saleType: 'CREDIT', ratePaisaPerLitre: 20000 }], []);

    // Offline, the phone already shows the balance (cash sale counted as paid).
    const local = await loadSales(owner.repo);
    const b = balances(local.deliveries.map((d) => d.data), local.payments.map((p) => p.data));
    expect(b.get(c1)!.balancePaisa).toBe(100000);
    expect(b.get(c2)!.balancePaisa).toBe(0);

    owner.online = worker.online = true;
    await owner.sync();
    await worker.sync();
    expect(worker.engine.status.conflicts).toBe(1);
    const c = (await worker.repo.list<any>('SyncConflict')).find((x) => x.data.status === 'OPEN' && x.data.mine.data.customerId === c1 && x.data.mine.data.date === date)!.data;
    expect(c.type).toBe('DUPLICATE');
    await worker.repo.resolveConflict(worker.userId, c.id, { action: 'keep_theirs' });
    await worker.sync();
    await owner.sync();
    for (const p of [owner, worker]) {
      const s = await loadSales(p.repo);
      const day = s.deliveries.filter((d) => d.data.date === date);
      expect(day.map((d) => d.data.quantityMl).sort()).toEqual([3000, 5000]);
      const bal = balances(s.deliveries.map((d) => d.data), s.payments.map((x) => x.data));
      expect(bal.get(c1)!.balancePaisa).toBe(100000);
      expect(bal.get(c2)!.balancePaisa).toBe(0);
    }
    expect(worker.engine.status).toMatchObject({ conflicts: 0, pending: 0 });
  });

  it('a partial payment recorded offline syncs once and reduces the balance everywhere', async () => {
    const c1 = (await loadSales(owner.repo)).customers.find((c) => c.data.name === 'Shop 1')!.id;
    worker.online = false;
    await worker.repo.create('CustomerPayment', worker.userId, randomUUID(), { customerId: c1, date: today, amountPaisa: 40000, method: 'CASH', note: null });
    worker.online = true;
    await worker.sync();
    await worker.sync();
    await owner.sync();
    const s = await loadSales(owner.repo);
    expect(balances(s.deliveries.map((d) => d.data), s.payments.map((x) => x.data)).get(c1)!.balancePaisa).toBe(60000);
  });
});
