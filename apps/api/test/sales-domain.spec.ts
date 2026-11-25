/** Phone-side sales calculations (apps/mobile/src/domain/sales.ts). */
import { balances, ledger, parseRupees, rateOn, soldByDate, type CustomerPayment, type CustomerRate, type MilkDelivery } from '../../mobile/src/domain/sales';

const rate = (customerId: string, rs: number, from: string): CustomerRate => ({ id: `${customerId}${from}`, customerId, ratePaisaPerLitre: rs * 100, effectiveFrom: from, note: null, createdAt: '2026-01-01T00:00:00Z', deletedAt: null });
const del = (customerId: string, date: string, litres: number, rs: number, saleType: 'CASH' | 'CREDIT' = 'CREDIT', cashPaymentId: string | null = null): MilkDelivery => ({
  id: `${customerId}${date}${litres}`, customerId, date, session: 'MORNING', quantityMl: litres * 1000, ratePaisaPerLitre: rs * 100, amountPaisa: litres * rs * 100,
  saleType, cashPaymentId, note: null, createdById: 'u', deletedAt: null,
});
const pay = (customerId: string, date: string, rs: number, id = `${customerId}${date}${rs}`): CustomerPayment => ({ id, customerId, date, amountPaisa: rs * 100, method: 'CASH', deliveryId: null, note: null, createdById: 'u', deletedAt: null });

it('uses the rate in effect on the delivery date', () => {
  const rates = [rate('A', 200, '2026-10-01'), rate('A', 220, '2026-11-15'), rate('B', 180, '2026-10-01')];
  expect(rateOn(rates, 'A', '2026-11-14')?.ratePaisaPerLitre).toBe(20000);
  expect(rateOn(rates, 'A', '2026-11-15')?.ratePaisaPerLitre).toBe(22000);
  expect(rateOn(rates, 'A', '2026-09-30')).toBeNull();
});

it('balance = delivered minus paid, with partial payments and advances', () => {
  const d = [del('A', '2026-11-01', 5, 200), del('A', '2026-11-02', 5, 200), del('B', '2026-11-01', 2, 180)];
  const p = [pay('A', '2026-11-03', 1500), pay('B', '2026-11-02', 500)];
  const b = balances(d, p);
  expect(b.get('A')).toMatchObject({ deliveredMl: 10000, billedPaisa: 200000, paidPaisa: 150000, balancePaisa: 50000 });
  expect(b.get('B')!.balancePaisa).toBe(36000 - 50000); // paid in advance
});

it('an unsynced cash sale counts as paid, a synced one is not counted twice', () => {
  const cash = del('A', '2026-11-01', 2, 200, 'CASH', 'pay-1');
  expect(balances([cash], []).get('A')!.balancePaisa).toBe(0);
  const synced = { ...pay('A', '2026-11-01', 400, 'pay-1'), deliveryId: cash.id };
  expect(balances([cash], [synced]).get('A')).toMatchObject({ paidPaisa: 40000, balancePaisa: 0 });
});

it('statement shows a running balance', () => {
  const lines = ledger('A', [del('A', '2026-11-01', 5, 200), del('A', '2026-11-02', 4, 200, 'CASH', 'p2')], [pay('A', '2026-11-01', 600)]);
  expect(lines.map((l) => [l.kind, l.balanceAfter / 100])).toEqual([
    ['delivery', 1000], ['payment', 400], ['delivery', 1200], ['payment', 400],
  ]);
});

it('sums sold litres per day and parses rupees', () => {
  expect(soldByDate([del('A', '2026-11-01', 5, 200), del('B', '2026-11-01', 2, 180)])).toEqual({ '2026-11-01': 7000 });
  expect(parseRupees('1,250')).toBe(125000);
  expect(parseRupees('99.5')).toBe(9950);
  expect(parseRupees('x')).toBe('invalid');
});
