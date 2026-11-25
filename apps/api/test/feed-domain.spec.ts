/** Phone-side feed calculations (apps/mobile/src/domain/feed.ts). */
import { averageCostPerKg, bagsText, feedByAnimal, feedExpense, parseKg, stockByItem, supplierBalances, supplierLedger, type FeedConsumption, type FeedPurchase, type SupplierPayment } from '../../mobile/src/domain/feed';

const buy = (id: string, date: string, kgs: number, rs: number, extra: Partial<FeedPurchase> = {}): FeedPurchase => ({
  id, feedItemId: 'wanda', supplierId: 'S', date, quantityGrams: kgs * 1000, bags: null, totalPaisa: rs * 100, costPerKgPaisa: 0,
  paymentType: 'CREDIT', cashPaymentId: null, note: null, deletedAt: null, ...extra,
});
const feed = (date: string, kgs: number, animalIds: string[], wasted = 0, feedItemId = 'wanda'): FeedConsumption => ({
  id: `${date}${kgs}${animalIds.join()}`, feedItemId, date, quantityGrams: kgs * 1000, wastedGrams: wasted * 1000, animalIds, note: null, createdById: 'u', deletedAt: null,
});
const pay = (date: string, rs: number): SupplierPayment => ({ id: `p${date}${rs}`, supplierId: 'S', date, amountPaisa: rs * 100, method: 'CASH', purchaseId: null, note: null, deletedAt: null });

const purchases = [buy('b1', '2026-11-01', 100, 9000), buy('b2', '2026-11-10', 100, 11000)];

it('stock = bought − fed − wasted ± corrections', () => {
  const s = stockByItem(purchases, [feed('2026-11-05', 30, ['A'], 2)], [{ id: 'a', feedItemId: 'wanda', date: '2026-11-11', changeGrams: -3000, reason: 'count', deletedAt: null }]);
  expect(s.get('wanda')).toBe(200_000 - 32_000 - 3000);
});

it('average price uses purchases up to the feeding date', () => {
  expect(averageCostPerKg(purchases, 'wanda', '2026-11-05')).toBe(9000); // Rs 90/kg
  expect(averageCostPerKg(purchases, 'wanda', '2026-11-10')).toBe(10000); // (9000+11000)/200 = Rs 100/kg
  expect(averageCostPerKg(purchases, 'wanda', '2026-10-01')).toBeNull();
});

it('feed expense counts fed and wasted feed, never purchases; unknown prices are flagged', () => {
  const e = feedExpense([feed('2026-11-05', 10, ['A'], 1), feed('2026-11-12', 10, ['A']), feed('2026-11-12', 5, ['A'], 0, 'unbought')], purchases, '2026-11-01', '2026-11-30');
  expect(e.costPaisa).toBe(11 * 9000 + 10 * 10000);
  expect(e).toMatchObject({ fedGrams: 25000, wastedGrams: 1000, unpricedGrams: 5000 });
});

it('shared feed is split equally per cow and marked as an estimate', () => {
  const m = feedByAnimal([feed('2026-11-05', 30, ['A', 'B', 'C']), feed('2026-11-06', 4, ['A'])], purchases, '2026-11-01', '2026-11-30');
  expect(m.get('A')).toMatchObject({ grams: 14000, costPaisa: Math.round((30 * 9000) / 3 + 4 * 9000), estimated: true });
  expect(m.get('B')).toMatchObject({ grams: 10000, estimated: true });
  const solo = feedByAnimal([feed('2026-11-06', 4, ['A'])], purchases, '2026-11-01', '2026-11-30');
  expect(solo.get('A')!.estimated).toBe(false);
});

it('supplier balance: credit purchases minus payments; cash purchases are paid', () => {
  const cash = buy('b3', '2026-11-12', 10, 1000, { paymentType: 'CASH', cashPaymentId: 'cp' });
  const b = supplierBalances([...purchases, cash], [pay('2026-11-15', 15000)]);
  expect(b.get('S')).toMatchObject({ purchasedPaisa: 2_100_000, paidPaisa: 1_600_000, balancePaisa: 500_000 });
  const lines = supplierLedger('S', [...purchases, cash], [pay('2026-11-15', 15000)]);
  expect(lines.map((l) => l.balanceAfter / 100)).toEqual([9000, 20000, 21000, 20000, 5000]);
});

it('parses kg and shows bags', () => {
  expect(parseKg('12.5')).toBe(12500);
  expect(parseKg('x')).toBe('invalid');
  expect(bagsText(110_000, 50_000)).toEqual({ bags: 2, restGrams: 10_000 });
  expect(bagsText(110_000, null)).toBeNull();
});
