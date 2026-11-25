import { EXPENSE_CATEGORIES, farmToday, type CapitalType, type ExpenseCategory, type MilkUsageType } from '@dairy/shared';
import type { LocalRepo } from '../sync/repo';
import { loadAnimals, type AnimalView } from './animals';
import { loadMilk, milkingOn, summarizeMonth, type MilkRecord, type MilkUsage } from './milk';
import { balances, loadSales, type Customer, type CustomerPayment, type MilkDelivery } from './sales';
import { feedByAnimal, feedExpense, loadFeed, supplierBalances, type FeedConsumption, type FeedPurchase, type SupplierPayment } from './feed';
import { capitalTotals, cashBook, cashForPeriod, expensesByCategory, loadFinance, type CapitalEntry, type Expense, type FarmSettings } from './finance';

/** Everything a report needs, as plain records. */
export interface ReportData {
  animals: AnimalView[];
  milkRecords: MilkRecord[];
  milkUsages: MilkUsage[];
  customers: Customer[];
  deliveries: MilkDelivery[];
  customerPayments: CustomerPayment[];
  purchases: FeedPurchase[];
  consumptions: FeedConsumption[];
  supplierPayments: SupplierPayment[];
  expenses: Expense[];
  capital: CapitalEntry[];
  settings: FarmSettings | null;
}

export async function loadReportData(repo: LocalRepo): Promise<ReportData> {
  const [animals, milk, sales, feed, fin] = await Promise.all([loadAnimals(repo), loadMilk(repo), loadSales(repo), loadFeed(repo), loadFinance(repo)]);
  return {
    animals,
    milkRecords: milk.records.map((r) => r.data),
    milkUsages: milk.usages.map((u) => u.data),
    customers: sales.customers.map((c) => c.data),
    deliveries: sales.deliveries.map((d) => d.data),
    customerPayments: sales.payments.map((p) => p.data),
    purchases: feed.purchases.map((p) => p.data),
    consumptions: feed.consumptions.map((c) => c.data),
    supplierPayments: feed.payments.map((p) => p.data),
    expenses: fin.expenses.map((e) => e.data),
    capital: fin.capital.map((c) => c.data),
    settings: fin.settings,
  };
}

export function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`;
  const end = `${month}-${String(last).padStart(2, '0')}`;
  const today = farmToday();
  return { from, to: end, upTo: end < today ? end : today, inProgress: today.slice(0, 7) === month, future: from > today };
}

/** Days in the period with milking cows on the farm but no feeding recorded. */
export function daysWithoutFeeding(d: ReportData, from: string, to: string): number {
  const fedDays = new Set(d.consumptions.filter((c) => !c.deletedAt).map((c) => c.date));
  let n = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (!fedDays.has(day) && milkingOn(d.animals, day).length > 0) n++;
  }
  return n;
}

export interface MonthReport {
  month: string;
  from: string;
  to: string;
  inProgress: boolean;
  milk: {
    producedMl: number; soldMl: number; usedMl: Record<MilkUsageType, number>;
    /** Produced − sold − used. Positive = not accounted for; negative = more sold/used than recorded produced. */
    unaccountedMl: number;
    recorded: number; expected: number; complete: boolean;
  };
  sales: { revenuePaisa: number; avgPricePerLitrePaisa: number | null; paymentsReceivedPaisa: number; customersOweAtEndPaisa: number; advancesAtEndPaisa: number };
  feed: { costPaisa: number; fedGrams: number; wastedGrams: number; unpricedGrams: number; purchasesPaisa: number; daysWithoutFeeding: number };
  expenses: { byCategory: Record<ExpenseCategory, number>; totalPaisa: number };
  /** Milk sales − feed used − other operating expenses. Always an estimate (feed at average price). */
  operatingProfitPaisa: number;
  cash: { startPaisa: number; inPaisa: number; outPaisa: number; endPaisa: number; openingSet: boolean };
  capital: Partial<Record<CapitalType, number>>;
  suppliersOwedAtEndPaisa: number;
  /** Reasons the numbers may be incomplete or estimated. */
  warnings: ('IN_PROGRESS' | 'MILK_INCOMPLETE' | 'FEED_DAYS_MISSING' | 'FEED_UNPRICED' | 'NO_OPENING_CASH')[];
}

const before = <T extends { date: string; deletedAt: string | null }>(xs: T[], to: string) => xs.filter((x) => !x.deletedAt && x.date <= to);

export function monthReport(d: ReportData, month: string): MonthReport {
  const b = monthBounds(month);
  const range = { from: b.from, to: b.upTo };

  // Milk
  const ms = summarizeMonth(month, d.animals, d.milkRecords, d.milkUsages, {});
  const liveDeliveries = d.deliveries.filter((x) => !x.deletedAt && x.date >= b.from && x.date <= b.to);
  const soldMl = liveDeliveries.reduce((s, x) => s + x.quantityMl, 0);
  const used = ms.usedMl.CALF_FED + ms.usedMl.HOME + ms.usedMl.DISCARDED;

  // Sales: revenue when milk is delivered (paid or not); payments separately.
  const revenuePaisa = liveDeliveries.reduce((s, x) => s + x.amountPaisa, 0);
  const bal = balances(d.deliveries, d.customerPayments, { to: b.to });
  const owe = [...bal.values()].reduce((s, x) => s + Math.max(0, x.balancePaisa), 0);
  const adv = [...bal.values()].reduce((s, x) => s + Math.max(0, -x.balancePaisa), 0);
  const monthPay = balances(d.deliveries, d.customerPayments, { from: b.from, to: b.to });
  const paymentsReceivedPaisa = [...monthPay.values()].reduce((s, x) => s + x.paidPaisa, 0);

  // Feed: the expense is what was fed/wasted; purchases are shown for information only.
  const fe = feedExpense(d.consumptions, d.purchases, b.from, b.to);
  const purchasesPaisa = d.purchases.filter((p) => !p.deletedAt && p.date >= b.from && p.date <= b.to).reduce((s, p) => s + p.totalPaisa, 0);
  const noFeedDays = b.future ? 0 : daysWithoutFeeding(d, range.from, range.to);

  const exp = expensesByCategory(d.expenses, b.from, b.to);
  const profit = revenuePaisa - fe.costPaisa - exp.total;

  const book = cashBook({ expenses: d.expenses, capital: d.capital, customerPayments: d.customerPayments, supplierPayments: d.supplierPayments, purchases: d.purchases, settings: d.settings });
  const cash = cashForPeriod(book, b.from, b.to);

  const sb = supplierBalances(before(d.purchases, b.to), before(d.supplierPayments, b.to), before(d.expenses, b.to) as any);
  const suppliersOwed = [...sb.values()].reduce((s, x) => s + Math.max(0, x.balancePaisa), 0);

  const warnings: MonthReport['warnings'] = [];
  if (b.inProgress) warnings.push('IN_PROGRESS');
  if (!ms.complete) warnings.push('MILK_INCOMPLETE');
  if (noFeedDays > 0) warnings.push('FEED_DAYS_MISSING');
  if (fe.unpricedGrams > 0) warnings.push('FEED_UNPRICED');
  if (!d.settings?.openingCashDate) warnings.push('NO_OPENING_CASH');

  return {
    month, from: b.from, to: b.to, inProgress: b.inProgress,
    milk: { producedMl: ms.producedMl, soldMl, usedMl: ms.usedMl, unaccountedMl: ms.producedMl - soldMl - used, recorded: ms.recorded, expected: ms.expected, complete: ms.complete },
    sales: { revenuePaisa, avgPricePerLitrePaisa: soldMl ? Math.round((revenuePaisa * 1000) / soldMl) : null, paymentsReceivedPaisa, customersOweAtEndPaisa: owe, advancesAtEndPaisa: adv },
    feed: { costPaisa: fe.costPaisa, fedGrams: fe.fedGrams, wastedGrams: fe.wastedGrams, unpricedGrams: fe.unpricedGrams, purchasesPaisa, daysWithoutFeeding: noFeedDays },
    expenses: { byCategory: exp.by, totalPaisa: exp.total },
    operatingProfitPaisa: profit,
    cash: { startPaisa: cash.start, inPaisa: cash.inPaisa, outPaisa: cash.outPaisa, endPaisa: cash.end, openingSet: !!d.settings?.openingCashDate },
    capital: capitalTotals(d.capital, b.from, b.to),
    suppliersOwedAtEndPaisa: suppliersOwed,
    warnings,
  };
}

export interface CowRow {
  animal: AnimalView;
  milkMl: number;
  milkings: number;
  /** Milk × the month's average sale price: an estimate of the milk's value. */
  milkValuePaisa: number | null;
  feedCostPaisa: number;
  feedEstimated: boolean;
  feedUnpricedGrams: number;
}

/** Per animal for the month: milk, estimated milk value, feed cost (shared feed split equally = estimate). */
export function perCow(d: ReportData, month: string, avgPricePerLitrePaisa: number | null): CowRow[] {
  const b = monthBounds(month);
  const feed = feedByAnimal(d.consumptions, d.purchases, b.from, b.to);
  const rows: CowRow[] = [];
  for (const a of d.animals) {
    const recs = d.milkRecords.filter((r) => !r.deletedAt && r.animalId === a.animal.id && r.date >= b.from && r.date <= b.to);
    const f = feed.get(a.animal.id);
    if (!recs.length && !f) continue;
    const milkMl = recs.reduce((s, r) => s + r.quantityMl, 0);
    rows.push({
      animal: a, milkMl, milkings: recs.length,
      milkValuePaisa: avgPricePerLitrePaisa === null ? null : Math.round((milkMl * avgPricePerLitrePaisa) / 1000),
      feedCostPaisa: f?.costPaisa ?? 0, feedEstimated: f?.estimated ?? false, feedUnpricedGrams: f?.unpricedGrams ?? 0,
    });
  }
  return rows.sort((x, y) => y.milkMl - x.milkMl);
}

/** Last n months (oldest first), for the trend table. */
export function trend(d: ReportData, endMonth: string, n = 6): MonthReport[] {
  const out: MonthReport[] = [];
  const [y, m] = endMonth.split('-').map(Number);
  for (let i = n - 1; i >= 0; i--) {
    const mm = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
    out.push(monthReport(d, mm));
  }
  return out;
}

export { EXPENSE_CATEGORIES };
