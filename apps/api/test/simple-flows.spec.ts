/** The simplified flows: milk use entered with a milking, and monthly feeding totals. */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { farmToday } from '@dairy/shared';
import { createApp, mutation, newAnimal, resetDb } from './helpers';
import { Phone } from './phone';
import { loadMilk, saveSessionUsage, summarizeDay } from '../../mobile/src/domain/milk';
import { loadFeed, monthlyEntryDate, saveMonthlyFeeding, stockByItem } from '../../mobile/src/domain/feed';
import { loadAnimals } from '../../mobile/src/domain/animals';
import { loadReportData, monthReport } from '../../mobile/src/domain/reports';

let app: INestApplication;
let token: string;
let phone: Phone;
let other: Phone;
let wanda: string;
const today = farmToday();
const month = today.slice(0, 7);

beforeAll(async () => {
  app = await createApp();
  await resetDb(app);
  const s = await request(app.getHttpServer()).post('/api/auth/setup').send({ setupCode: 'test-setup', name: 'Jamal', username: 'jamal', password: 'secret123' });
  token = s.body.accessToken;
  wanda = randomUUID();
  const a = newAnimal('1');
  await request(app.getHttpServer()).post('/api/sync/push').set('Authorization', `Bearer ${token}`).send({ mutations: [
    a.m(),
    mutation({ entity: 'FeedItem', op: 'create', recordId: wanda, data: { name: 'Wanda', category: 'CONCENTRATE', bagWeightGrams: 50_000 } }),
    mutation({ entity: 'FeedPurchase', op: 'create', recordId: randomUUID(), data: { feedItemId: wanda, date: `${month}-01`, quantityGrams: 200_000, bags: 4, totalPaisa: 1_800_000, paymentType: 'CASH' } }),
  ] });
  phone = await new Phone(app, s.body.user.id, token).init();
  other = await new Phone(app, s.body.user.id, token).init();
  await phone.sync();
  await other.sync();
});
afterAll(() => app.close());

it('milk fed to calves / used at home is saved with the milking and can be changed', async () => {
  await saveSessionUsage(phone.repo, phone.userId, randomUUID, today, 'MORNING', { CALF_FED: 2000, HOME: 1000, DISCARDED: null }, []);
  let usages = (await loadMilk(phone.repo)).usages;
  await saveSessionUsage(phone.repo, phone.userId, randomUUID, today, 'MORNING', { CALF_FED: 2500, HOME: null }, usages);
  await phone.sync();
  usages = (await loadMilk(phone.repo)).usages;
  expect(usages.map((u) => [u.data.type, u.data.quantityMl, u.data.session])).toEqual([['CALF_FED', 2500, 'MORNING']]);
  const day = summarizeDay(today, await loadAnimals(phone.repo), [], usages.map((u) => u.data));
  expect(day.usedMl.CALF_FED).toBe(2500);
  expect(phone.engine.status).toMatchObject({ pending: 0, rejected: 0, conflicts: 0 });
});

it('the same milking entered on two phones offline does not count calves twice', async () => {
  other.online = phone.online = false;
  await saveSessionUsage(other.repo, other.userId, randomUUID, today, 'EVENING', { CALF_FED: 3000 }, []);
  await saveSessionUsage(phone.repo, phone.userId, randomUUID, today, 'EVENING', { CALF_FED: 3500 }, []);
  other.online = phone.online = true;
  await other.sync();
  await phone.sync();
  expect(phone.engine.status.conflicts).toBe(1);
  await other.sync();
  const evening = (await loadMilk(other.repo)).usages.filter((u) => u.data.session === 'EVENING');
  expect(evening).toHaveLength(1);
});

it('monthly feeding: one total per feed type, profit uses it, and no "missing days" warning', async () => {
  const animals = (await loadAnimals(phone.repo)).map((a) => a.animal.id);
  let f = await loadFeed(phone.repo);
  await saveMonthlyFeeding(phone.repo, phone.userId, randomUUID, month, today, [{ feedItemId: wanda, grams: 150_000 }], f.consumptions, animals);
  f = await loadFeed(phone.repo);
  await saveMonthlyFeeding(phone.repo, phone.userId, randomUUID, month, today, [{ feedItemId: wanda, grams: 180_000 }], f.consumptions, animals);
  await phone.sync();
  f = await loadFeed(phone.repo);
  const monthly = f.consumptions.filter((c) => c.data.period === 'MONTH');
  expect(monthly.map((c) => [c.data.quantityGrams, c.data.date])).toEqual([[180_000, monthlyEntryDate(month, today)]]);
  expect(stockByItem(f.purchases.map((p) => p.data), f.consumptions.map((c) => c.data), []).get(wanda)).toBe(20_000);
  const r = monthReport(await loadReportData(phone.repo), month);
  expect(r.feed.costPaisa).toBe(180 * 9000); // 180 kg at Rs 90/kg
  expect(r.feed.daysWithoutFeeding).toBe(0);

  // A second monthly total for the same feed and month from another phone is a duplicate, not a double cost.
  await other.sync();
  other.online = false;
  const of = await loadFeed(other.repo);
  await other.repo.create('FeedConsumption', other.userId, randomUUID(), { feedItemId: wanda, date: monthlyEntryDate(month, today), quantityGrams: 100_000, wastedGrams: 0, animalIds: animals, period: 'MONTH', note: null });
  other.online = true;
  await other.sync();
  expect(other.engine.status.conflicts).toBe(1);
  expect(of.consumptions.length).toBeGreaterThan(0);
});

it('monthly date: last day of a past month, today for this month', () => {
  expect(monthlyEntryDate('2026-02', '2026-11-25')).toBe('2026-02-28');
  expect(monthlyEntryDate('2026-11', '2026-11-25')).toBe('2026-11-25');
});
