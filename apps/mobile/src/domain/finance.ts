import { CAPITAL_IN, EXPENSE_CATEGORIES, FARM_SETTINGS_ID, type CapitalType, type ExpenseCategory, type PaymentMethod, type SaleType } from '@dairy/shared';
import type { LocalRecord, LocalRepo } from '../sync/repo';
import type { CustomerPayment } from './sales';
import type { FeedPurchase, SupplierPayment } from './feed';

export interface Expense {
  id: string; date: string; category: ExpenseCategory; amountPaisa: number; description: string | null;
  supplierId: string | null; paymentType: SaleType; method: PaymentMethod; cashPaymentId: string | null;
  animalId: string | null; receiptPhotoId: string | null; createdById: string; deletedAt: string | null;
}
export interface CapitalEntry {
  id: string; date: string; type: CapitalType; amountPaisa: number; description: string | null; method: PaymentMethod;
  animalId: string | null; receiptPhotoId: string | null; createdById: string; deletedAt: string | null;
}
export interface FarmSettings { id: string; farmName: string | null; openingCashPaisa: number; openingCashDate: string | null }

export interface FinanceData {
  expenses: LocalRecord<Expense>[];
  capital: LocalRecord<CapitalEntry>[];
  settings: FarmSettings | null;
  customerPayments: CustomerPayment[];
  supplierPayments: SupplierPayment[];
  purchases: FeedPurchase[];
}

export async function loadFinance(repo: LocalRepo): Promise<FinanceData> {
  const [expenses, capital, settings, cp, sp, fp] = await Promise.all([
    repo.list<Expense>('Expense'), repo.list<CapitalEntry>('CapitalEntry'), repo.get<FarmSettings>('FarmSettings', FARM_SETTINGS_ID),
    repo.list<CustomerPayment>('CustomerPayment'), repo.list<SupplierPayment>('SupplierPayment'), repo.list<FeedPurchase>('FeedPurchase'),
  ]);
  return {
    expenses, capital, settings: settings?.data ?? null,
    customerPayments: cp.map((x) => x.data), supplierPayments: sp.map((x) => x.data), purchases: fp.map((x) => x.data),
  };
}

const live = <T extends { deletedAt: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
export const isCapitalIn = (t: CapitalType) => CAPITAL_IN.includes(t);

export type CashLineKind = 'customer_payment' | 'supplier_payment' | 'market_purchase' | 'expense' | 'capital';
export interface CashLine {
  kind: CashLineKind;
  id: string;
  date: string;
  /** + money in, − money out. */
  amountPaisa: number;
  method: PaymentMethod;
  ref: { customerId?: string; supplierId?: string; feedItemId?: string; category?: ExpenseCategory; capitalType?: CapitalType; description?: string | null };
  balanceAfter: number;
}

/**
 * Every rupee in and out, from the opening balance date.
 * In: customer payments, owner investment, animal sales.
 * Out: supplier payments (incl. those made automatically for cash purchases/expenses),
 *      cash feed purchases without a supplier, expenses paid now without a supplier,
 *      cow purchases, equipment, owner withdrawals.
 * Unsynced cash purchases/expenses with a supplier are counted through their purchase/expense.
 */
export function cashBook(d: { expenses: Expense[]; capital: CapitalEntry[]; customerPayments: CustomerPayment[]; supplierPayments: SupplierPayment[]; purchases: FeedPurchase[]; settings: FarmSettings | null }, extra?: { cashSalesNotSynced?: { id: string; customerId: string; date: string; amountPaisa: number }[] }) {
  const from = d.settings?.openingCashDate ?? '0000-00-00';
  const opening = d.settings?.openingCashPaisa ?? 0;
  const lines: Omit<CashLine, 'balanceAfter'>[] = [];
  const payIds = new Set(d.supplierPayments.map((p) => p.id));
  for (const p of live(d.customerPayments)) lines.push({ kind: 'customer_payment', id: p.id, date: p.date, amountPaisa: p.amountPaisa, method: p.method, ref: { customerId: p.customerId } });
  for (const s of extra?.cashSalesNotSynced ?? []) lines.push({ kind: 'customer_payment', id: s.id, date: s.date, amountPaisa: s.amountPaisa, method: 'CASH', ref: { customerId: s.customerId } });
  for (const p of live(d.supplierPayments)) lines.push({ kind: 'supplier_payment', id: p.id, date: p.date, amountPaisa: -p.amountPaisa, method: p.method, ref: { supplierId: p.supplierId } });
  for (const p of live(d.purchases)) {
    if (p.paymentType !== 'CASH') continue;
    if (p.supplierId && p.cashPaymentId && payIds.has(p.cashPaymentId)) continue; // counted as a supplier payment
    lines.push({ kind: 'market_purchase', id: p.id, date: p.date, amountPaisa: -p.totalPaisa, method: 'CASH', ref: { feedItemId: p.feedItemId, supplierId: p.supplierId ?? undefined } });
  }
  for (const e of live(d.expenses)) {
    if (e.paymentType !== 'CASH') continue;
    if (e.supplierId && e.cashPaymentId && payIds.has(e.cashPaymentId)) continue;
    lines.push({ kind: 'expense', id: e.id, date: e.date, amountPaisa: -e.amountPaisa, method: e.method, ref: { category: e.category, description: e.description, supplierId: e.supplierId ?? undefined } });
  }
  for (const c of live(d.capital)) {
    lines.push({ kind: 'capital', id: c.id, date: c.date, amountPaisa: isCapitalIn(c.type) ? c.amountPaisa : -c.amountPaisa, method: c.method, ref: { capitalType: c.type, description: c.description } });
  }
  const inRange = lines.filter((l) => l.date >= from);
  inRange.sort((a, b) => (a.date === b.date ? b.amountPaisa - a.amountPaisa : a.date.localeCompare(b.date)));
  let bal = opening;
  const out: CashLine[] = inRange.map((l) => ({ ...l, balanceAfter: (bal += l.amountPaisa) }));
  return { opening, openingDate: d.settings?.openingCashDate ?? null, lines: out, balance: bal };
}

/** Money in/out within a period, and the balance before and after it. */
export function cashForPeriod(book: ReturnType<typeof cashBook>, from: string, to: string) {
  const before = book.lines.filter((l) => l.date < from);
  const during = book.lines.filter((l) => l.date >= from && l.date <= to);
  const start = before.length ? before[before.length - 1].balanceAfter : book.opening;
  const inPaisa = during.filter((l) => l.amountPaisa > 0).reduce((s, l) => s + l.amountPaisa, 0);
  const outPaisa = -during.filter((l) => l.amountPaisa < 0).reduce((s, l) => s + l.amountPaisa, 0);
  return { start, inPaisa, outPaisa, end: start + inPaisa - outPaisa, lines: during };
}

/** Operating expenses (not feed, not capital) per category for a period. Credit expenses count when incurred. */
export function expensesByCategory(expenses: Expense[], from: string, to: string) {
  const by = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<ExpenseCategory, number>;
  for (const e of live(expenses)) if (e.date >= from && e.date <= to) by[e.category] += e.amountPaisa;
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return { by, total };
}

export function capitalTotals(capital: CapitalEntry[], from: string, to: string) {
  const by: Partial<Record<CapitalType, number>> = {};
  for (const c of live(capital)) if (c.date >= from && c.date <= to) by[c.type] = (by[c.type] ?? 0) + c.amountPaisa;
  return by;
}

/** Cash book straight from the phone's stored data. */
export function cashBookOf(f: FinanceData) {
  return cashBook({ ...f, expenses: f.expenses.map((e) => e.data), capital: f.capital.map((c) => c.data) });
}
