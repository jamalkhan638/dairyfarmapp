/** Phone-side money calculations (apps/mobile/src/domain/finance.ts and supplier balances). */
import { cashBook, cashForPeriod, expensesByCategory, type CapitalEntry, type Expense } from '../../mobile/src/domain/finance';
import { supplierBalances, type FeedPurchase, type SupplierPayment } from '../../mobile/src/domain/feed';
import type { CustomerPayment } from '../../mobile/src/domain/sales';

const exp = (id: string, date: string, rs: number, extra: Partial<Expense> = {}): Expense => ({
  id, date, category: 'VET', amountPaisa: rs * 100, description: null, supplierId: null, paymentType: 'CASH', method: 'CASH',
  cashPaymentId: null, animalId: null, receiptPhotoId: null, createdById: 'u', deletedAt: null, ...extra,
});
const cap = (id: string, date: string, type: CapitalEntry['type'], rs: number): CapitalEntry => ({ id, date, type, amountPaisa: rs * 100, description: null, method: 'CASH', animalId: null, receiptPhotoId: null, createdById: 'u', deletedAt: null });
const cpay = (id: string, date: string, rs: number): CustomerPayment => ({ id, customerId: 'C', date, amountPaisa: rs * 100, method: 'CASH', deliveryId: null, note: null, createdById: 'u', deletedAt: null });
const spay = (id: string, date: string, rs: number, extra: Partial<SupplierPayment> = {}): SupplierPayment => ({ id, supplierId: 'S', date, amountPaisa: rs * 100, method: 'CASH', purchaseId: null, note: null, deletedAt: null, ...extra });
const buy = (id: string, date: string, rs: number, extra: Partial<FeedPurchase> = {}): FeedPurchase => ({ id, feedItemId: 'F', supplierId: null, date, quantityGrams: 1000, bags: null, totalPaisa: rs * 100, costPerKgPaisa: 0, paymentType: 'CASH', cashPaymentId: null, note: null, deletedAt: null, ...extra });

const data = {
  settings: { id: 's', farmName: null, openingCashPaisa: 50_000_00, openingCashDate: '2026-11-01' },
  customerPayments: [cpay('c1', '2026-11-02', 3000), cpay('old', '2026-10-30', 999)],
  supplierPayments: [spay('s1', '2026-11-03', 2000), spay('s2', '2026-11-04', 500, { purchaseId: 'b2' })],
  purchases: [buy('b1', '2026-11-03', 700), buy('b2', '2026-11-04', 500, { supplierId: 'S', cashPaymentId: 's2' }), buy('b3', '2026-11-04', 9000, { paymentType: 'CREDIT', supplierId: 'S' })],
  expenses: [exp('e1', '2026-11-05', 1500), exp('e2', '2026-11-05', 800, { supplierId: 'S', paymentType: 'CREDIT', category: 'MEDICINE' })],
  capital: [cap('k1', '2026-11-06', 'ANIMAL_PURCHASE', 250_000), cap('k2', '2026-11-06', 'OWNER_INVESTMENT', 300_000)],
};

it('cash book: opening + money in − money out, nothing counted twice, credit not counted', () => {
  const book = cashBook(data);
  // in: 3000 + 300000; out: 2000 + 700 (market) + 500 (cash purchase via its payment) + 1500 + 250000
  expect(book.balance / 100).toBe(50_000 + 3000 + 300_000 - 2000 - 700 - 500 - 1500 - 250_000);
  expect(book.lines.some((l) => l.id === 'old')).toBe(false); // before the opening date
  expect(book.lines.some((l) => l.id === 'b2')).toBe(false); // counted through payment s2
  expect(book.lines.some((l) => l.id === 'e2' || l.id === 'b3')).toBe(false); // on credit: no money moved
});

it('period view gives start, in, out and end', () => {
  const p = cashForPeriod(cashBook(data), '2026-11-05', '2026-11-30');
  expect(p.start / 100).toBe(50_000 + 3000 - 2000 - 700 - 500);
  expect(p.inPaisa / 100).toBe(300_000);
  expect(p.outPaisa / 100).toBe(1500 + 250_000);
  expect(p.end).toBe(cashBook(data).balance);
});

it('operating expenses by category exclude capital entries', () => {
  const e = expensesByCategory(data.expenses, '2026-11-01', '2026-11-30');
  expect(e.by.VET).toBe(150_000);
  expect(e.by.MEDICINE).toBe(80_000);
  expect(e.total).toBe(230_000);
});

it('supplier balance includes expenses bought on credit from them', () => {
  const b = supplierBalances(data.purchases, data.supplierPayments, data.expenses);
  // owed: purchases 500 + 9000, expense 800; paid: 2000 + 500
  expect(b.get('S')!.balancePaisa / 100).toBe(500 + 9000 + 800 - 2000 - 500);
});
