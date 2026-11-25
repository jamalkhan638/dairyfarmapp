/** Monthly report on the phone (apps/mobile/src/domain/reports.ts). */
import { monthReport, perCow, trend, type ReportData } from '../../mobile/src/domain/reports';
import type { AnimalView } from '../../mobile/src/domain/animals';

const cow = (id: string): AnimalView => ({
  animal: { id, tag: id, sex: 'FEMALE' } as any, record: {} as any, status: 'MILKING', statusDate: '2026-09-01',
  history: [{ id: `s${id}`, animalId: id, status: 'MILKING', effectiveDate: '2026-09-01', reason: null, createdAt: '2026-01-01T00:00:00Z', createdById: 'u', clientCreatedAt: null, deletedAt: null }],
});
const milk = (animalId: string, date: string, session: 'MORNING' | 'EVENING', l: number) => ({ id: `${animalId}${date}${session}`, animalId, date, session, quantityMl: l * 1000, note: null, createdById: 'u', updatedById: 'u', version: 1, deletedAt: null });
const del = (date: string, l: number, rs: number, saleType: 'CASH' | 'CREDIT' = 'CREDIT') => ({ id: `d${date}${l}`, customerId: 'C', date, session: 'MORNING' as const, quantityMl: l * 1000, ratePaisaPerLitre: rs * 100, amountPaisa: l * rs * 100, saleType, cashPaymentId: null, note: null, createdById: 'u', deletedAt: null });

function data(): ReportData {
  const records = [];
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    for (const c of ['A', 'B']) for (const s of ['MORNING', 'EVENING'] as const) records.push(milk(c, date, s, 5));
  }
  records.pop(); // one milking missing on 31 Oct
  return {
    animals: [cow('A'), cow('B')],
    milkRecords: records,
    milkUsages: [{ id: 'u', date: '2026-10-05', type: 'CALF_FED', quantityMl: 20_000, animalId: null, note: null, deletedAt: null }],
    customers: [],
    deliveries: [del('2026-10-01', 500, 200), del('2026-10-15', 50, 200)],
    customerPayments: [{ id: 'p', customerId: 'C', date: '2026-10-20', amountPaisa: 6_000_000, method: 'CASH', deliveryId: null, note: null, createdById: 'u', deletedAt: null }],
    purchases: [{ id: 'f', feedItemId: 'W', supplierId: 'S', date: '2026-09-25', quantityGrams: 1_000_000, bags: null, totalPaisa: 8_000_000, costPerKgPaisa: 8000, paymentType: 'CREDIT', cashPaymentId: null, note: null, deletedAt: null }],
    consumptions: Array.from({ length: 31 }, (_, i) => ({ id: `c${i}`, feedItemId: 'W', date: `2026-10-${String(i + 1).padStart(2, '0')}`, quantityGrams: 20_000, wastedGrams: 0, animalIds: ['A', 'B'], note: null, createdById: 'u', deletedAt: null })).filter((c) => c.date !== '2026-10-10'),
    supplierPayments: [{ id: 'sp', supplierId: 'S', date: '2026-10-10', amountPaisa: 3_000_000, method: 'CASH', purchaseId: null, note: null, deletedAt: null }],
    expenses: [{ id: 'e', date: '2026-10-12', category: 'LABOUR', amountPaisa: 2_500_000, description: null, supplierId: null, paymentType: 'CASH', method: 'CASH', cashPaymentId: null, animalId: null, receiptPhotoId: null, createdById: 'u', deletedAt: null }],
    capital: [{ id: 'k', date: '2026-10-03', type: 'EQUIPMENT', amountPaisa: 4_500_000, description: null, method: 'CASH', animalId: null, receiptPhotoId: null, createdById: 'u', deletedAt: null }],
    settings: { id: 's', farmName: null, openingCashPaisa: 10_000_000, openingCashDate: '2026-10-01' },
  };
}

it('operating profit = milk sales − feed used − other expenses; purchases and capital excluded', () => {
  const r = monthReport(data(), '2026-10');
  expect(r.sales.revenuePaisa).toBe(550 * 200 * 100); // Rs 110,000 (delivered, paid or not)
  expect(r.feed.costPaisa).toBe(30 * 20 * 8000); // 30 feeding days × 20 kg × Rs 80
  expect(r.expenses.totalPaisa).toBe(2_500_000);
  expect(r.operatingProfitPaisa).toBe(11_000_000 - 4_800_000 - 2_500_000);
  expect(r.feed.purchasesPaisa).toBe(0); // bought in September: not this month's expense anyway
  expect(r.capital.EQUIPMENT).toBe(4_500_000);
});

it('labels incomplete milk recording and missing feed days', () => {
  const r = monthReport(data(), '2026-10');
  expect(r.milk).toMatchObject({ expected: 124, recorded: 123, complete: false });
  expect(r.feed.daysWithoutFeeding).toBe(1);
  expect(r.warnings).toEqual(expect.arrayContaining(['MILK_INCOMPLETE', 'FEED_DAYS_MISSING']));
  expect(r.warnings).not.toContain('IN_PROGRESS');
});

it('milk accounting and balances at month end', () => {
  const r = monthReport(data(), '2026-10');
  expect(r.milk.producedMl).toBe(123 * 5000);
  expect(r.milk.soldMl).toBe(550_000);
  expect(r.milk.unaccountedMl).toBe(615_000 - 550_000 - 20_000);
  expect(r.sales.customersOweAtEndPaisa).toBe(11_000_000 - 6_000_000);
  expect(r.suppliersOwedAtEndPaisa).toBe(5_000_000);
  // cash: 100,000 + 60,000 − 30,000 (supplier) − 25,000 (labour) − 45,000 (equipment)
  expect(r.cash.endPaisa).toBe(6_000_000);
});

it('per cow: milk, estimated value and shared feed estimate', () => {
  const d = data();
  const r = monthReport(d, '2026-10');
  const rows = perCow(d, '2026-10', r.sales.avgPricePerLitrePaisa);
  const a = rows.find((x) => x.animal.animal.id === 'A')!;
  expect(a.milkMl).toBe(310_000);
  expect(a.milkValuePaisa).toBe(310 * 200 * 100);
  expect(a.feedCostPaisa).toBe((30 * 20 * 8000) / 2);
  expect(a.feedEstimated).toBe(true);
  expect(trend(d, '2026-10', 3).map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
});
