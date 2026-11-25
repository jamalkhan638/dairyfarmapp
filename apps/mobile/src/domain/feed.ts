import { costPerKgPaisa, type FeedCategory, type PaymentMethod, type SaleType } from '@dairy/shared';
import type { LocalRecord, LocalRepo } from '../sync/repo';

export interface Supplier { id: string; name: string; phone: string | null; address: string | null; notes: string | null; active: boolean; deletedAt: string | null }
export interface FeedItem { id: string; name: string; category: FeedCategory; bagWeightGrams: number | null; notes: string | null; active: boolean; deletedAt: string | null }
export interface FeedPurchase {
  id: string; feedItemId: string; supplierId: string | null; date: string; quantityGrams: number; bags: number | null;
  totalPaisa: number; costPerKgPaisa: number; paymentType: SaleType; cashPaymentId: string | null; note: string | null; deletedAt: string | null;
}
export interface SupplierPayment { id: string; supplierId: string; date: string; amountPaisa: number; method: PaymentMethod; purchaseId: string | null; expenseId?: string | null; note: string | null; deletedAt: string | null }
/** Minimal shape of an expense, for supplier balances (full type in finance.ts). */
export interface SupplierExpense { id: string; supplierId: string | null; date: string; amountPaisa: number; category: string; cashPaymentId: string | null; deletedAt: string | null }
export interface FeedConsumption { id: string; feedItemId: string; date: string; quantityGrams: number; wastedGrams: number; animalIds: string[]; period?: 'DAY' | 'MONTH'; note: string | null; createdById: string; deletedAt: string | null }
export interface StockAdjustment { id: string; feedItemId: string; date: string; changeGrams: number; reason: string | null; deletedAt: string | null }

export interface FeedData {
  suppliers: LocalRecord<Supplier>[];
  items: LocalRecord<FeedItem>[];
  purchases: LocalRecord<FeedPurchase>[];
  payments: LocalRecord<SupplierPayment>[];
  consumptions: LocalRecord<FeedConsumption>[];
  adjustments: LocalRecord<StockAdjustment>[];
}

export async function loadFeed(repo: LocalRepo): Promise<FeedData> {
  const [suppliers, items, purchases, payments, consumptions, adjustments] = await Promise.all([
    repo.list<Supplier>('Supplier'), repo.list<FeedItem>('FeedItem'), repo.list<FeedPurchase>('FeedPurchase'),
    repo.list<SupplierPayment>('SupplierPayment'), repo.list<FeedConsumption>('FeedConsumption'), repo.list<StockAdjustment>('StockAdjustment'),
  ]);
  suppliers.sort((a, b) => a.data.name.localeCompare(b.data.name));
  items.sort((a, b) => a.data.name.localeCompare(b.data.name));
  return { suppliers, items, purchases, payments, consumptions, adjustments };
}

const live = <T extends { deletedAt: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);

/** Stock in grams per item: bought − fed − wasted ± counted corrections (up to a date, if given). */
export function stockByItem(purchases: FeedPurchase[], consumptions: FeedConsumption[], adjustments: StockAdjustment[], asOf?: string): Map<string, number> {
  const ok = (d: string) => !asOf || d <= asOf;
  const m = new Map<string, number>();
  const add = (id: string, g: number) => m.set(id, (m.get(id) ?? 0) + g);
  for (const p of live(purchases)) if (ok(p.date)) add(p.feedItemId, p.quantityGrams);
  for (const c of live(consumptions)) if (ok(c.date)) add(c.feedItemId, -(c.quantityGrams + c.wastedGrams));
  for (const a of live(adjustments)) if (ok(a.date)) add(a.feedItemId, a.changeGrams);
  return m;
}

/**
 * Average price per kg of an item from all purchases up to a date (weighted by quantity).
 * Null when nothing was bought yet: the feed's cost is then unknown, not zero.
 */
export function averageCostPerKg(purchases: FeedPurchase[], feedItemId: string, upTo: string): number | null {
  let g = 0;
  let paisa = 0;
  for (const p of live(purchases)) {
    if (p.feedItemId !== feedItemId || p.date > upTo) continue;
    g += p.quantityGrams;
    paisa += p.totalPaisa;
  }
  return g > 0 ? costPerKgPaisa(paisa, g) : null;
}

/** Cost of one feeding (fed + wasted) at the average price on that day. Null = no price known. */
export function consumptionCost(c: FeedConsumption, purchases: FeedPurchase[]): number | null {
  const perKg = averageCostPerKg(purchases, c.feedItemId, c.date);
  return perKg === null ? null : Math.round(((c.quantityGrams + c.wastedGrams) * perKg) / 1000);
}

export interface FeedExpense {
  /** Feed cost for the period (fed + wasted). This is the feed expense for operating profit. */
  costPaisa: number;
  fedGrams: number;
  wastedGrams: number;
  /** Feed given with no purchase price known yet: not included in costPaisa. */
  unpricedGrams: number;
}

export function feedExpense(consumptions: FeedConsumption[], purchases: FeedPurchase[], from: string, to: string): FeedExpense {
  const out: FeedExpense = { costPaisa: 0, fedGrams: 0, wastedGrams: 0, unpricedGrams: 0 };
  for (const c of live(consumptions)) {
    if (c.date < from || c.date > to) continue;
    out.fedGrams += c.quantityGrams;
    out.wastedGrams += c.wastedGrams;
    const cost = consumptionCost(c, purchases);
    if (cost === null) out.unpricedGrams += c.quantityGrams + c.wastedGrams;
    else out.costPaisa += cost;
  }
  return out;
}

export interface CowFeed {
  grams: number;
  costPaisa: number;
  /** True when part of it comes from shared (group) feeding split equally. */
  estimated: boolean;
  unpricedGrams: number;
}

/** Feed per animal. Shared feed is split equally between the animals in the group (an estimate). */
export function feedByAnimal(consumptions: FeedConsumption[], purchases: FeedPurchase[], from: string, to: string): Map<string, CowFeed> {
  const m = new Map<string, CowFeed>();
  for (const c of live(consumptions)) {
    if (c.date < from || c.date > to || !c.animalIds.length) continue;
    const n = c.animalIds.length;
    const cost = consumptionCost(c, purchases);
    const grams = c.quantityGrams + c.wastedGrams;
    for (const id of c.animalIds) {
      const cur = m.get(id) ?? { grams: 0, costPaisa: 0, estimated: false, unpricedGrams: 0 };
      cur.grams += grams / n;
      if (cost === null) cur.unpricedGrams += grams / n;
      else cur.costPaisa += cost / n;
      if (n > 1) cur.estimated = true;
      m.set(id, cur);
    }
  }
  for (const v of m.values()) {
    v.grams = Math.round(v.grams);
    v.costPaisa = Math.round(v.costPaisa);
    v.unpricedGrams = Math.round(v.unpricedGrams);
  }
  return m;
}

export interface SupplierBalance { supplierId: string; purchasedPaisa: number; paidPaisa: number; balancePaisa: number }

/**
 * What the farm owes each supplier: purchases − payments. A cash purchase saved on
 * this phone but not synced yet has no payment record here, so it counts as paid.
 */
export function supplierBalances(purchases: FeedPurchase[], payments: SupplierPayment[], expenses: SupplierExpense[] = []): Map<string, SupplierBalance> {
  const m = new Map<string, SupplierBalance>();
  const get = (id: string) => {
    if (!m.has(id)) m.set(id, { supplierId: id, purchasedPaisa: 0, paidPaisa: 0, balancePaisa: 0 });
    return m.get(id)!;
  };
  const payIds = new Set(payments.map((p) => p.id));
  for (const p of live(purchases)) {
    if (!p.supplierId) continue;
    get(p.supplierId).purchasedPaisa += p.totalPaisa;
    if (p.cashPaymentId && !payIds.has(p.cashPaymentId)) get(p.supplierId).paidPaisa += p.totalPaisa;
  }
  for (const e of live(expenses)) {
    if (!e.supplierId) continue;
    get(e.supplierId).purchasedPaisa += e.amountPaisa;
    if (e.cashPaymentId && !payIds.has(e.cashPaymentId)) get(e.supplierId).paidPaisa += e.amountPaisa;
  }
  for (const p of live(payments)) get(p.supplierId).paidPaisa += p.amountPaisa;
  for (const b of m.values()) b.balancePaisa = b.purchasedPaisa - b.paidPaisa;
  return m;
}

export type SupplierLine =
  | { kind: 'purchase'; date: string; id: string; purchase: FeedPurchase; balanceAfter: number }
  | { kind: 'expense'; date: string; id: string; expense: SupplierExpense; balanceAfter: number }
  | { kind: 'payment'; date: string; id: string; payment: SupplierPayment; balanceAfter: number };

/** Supplier statement with running balance (what the farm owes after each line). */
export function supplierLedger(supplierId: string, purchases: FeedPurchase[], payments: SupplierPayment[], expenses: SupplierExpense[] = []): SupplierLine[] {
  const payIds = new Set(payments.map((p) => p.id));
  const lines: { kind: 'purchase' | 'expense' | 'payment'; date: string; id: string; amount: number; purchase?: FeedPurchase; expense?: SupplierExpense; payment?: SupplierPayment }[] = [];
  for (const e of live(expenses)) {
    if (e.supplierId !== supplierId) continue;
    lines.push({ kind: 'expense', date: e.date, id: e.id, amount: e.amountPaisa, expense: e });
    if (e.cashPaymentId && !payIds.has(e.cashPaymentId)) {
      lines.push({ kind: 'payment', date: e.date, id: e.cashPaymentId, amount: -e.amountPaisa, payment: { id: e.cashPaymentId, supplierId, date: e.date, amountPaisa: e.amountPaisa, method: 'CASH', purchaseId: null, expenseId: e.id, note: null, deletedAt: null } });
    }
  }
  for (const p of live(purchases)) {
    if (p.supplierId !== supplierId) continue;
    lines.push({ kind: 'purchase', date: p.date, id: p.id, amount: p.totalPaisa, purchase: p });
    if (p.cashPaymentId && !payIds.has(p.cashPaymentId)) {
      lines.push({ kind: 'payment', date: p.date, id: p.cashPaymentId, amount: -p.totalPaisa, payment: { id: p.cashPaymentId, supplierId, date: p.date, amountPaisa: p.totalPaisa, method: 'CASH', purchaseId: p.id, note: null, deletedAt: null } });
    }
  }
  for (const p of live(payments)) if (p.supplierId === supplierId) lines.push({ kind: 'payment', date: p.date, id: p.id, amount: -p.amountPaisa, payment: p });
  const rank = (k: string) => (k === 'payment' ? 1 : 0);
  lines.sort((a, b) => (a.date === b.date ? rank(a.kind) - rank(b.kind) : a.date.localeCompare(b.date)));
  let bal = 0;
  return lines.map((l) => {
    bal += l.amount;
    if (l.kind === 'purchase') return { kind: 'purchase', date: l.date, id: l.id, purchase: l.purchase!, balanceAfter: bal };
    if (l.kind === 'expense') return { kind: 'expense', date: l.date, id: l.id, expense: l.expense!, balanceAfter: bal };
    return { kind: 'payment', date: l.date, id: l.id, payment: l.payment!, balanceAfter: bal };
  });
}

/** "12.5" kg typed by the user into grams. */
export function parseKg(text: string): number | null | 'invalid' {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{0,3})?$/.test(t)) return 'invalid';
  return Math.round(Number(t) * 1000);
}

export const kg = (g: number) => (g / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Stock shown as bags too, when the item has a bag weight: "3 bags + 12 kg". */
export function bagsText(grams: number, bagWeightGrams: number | null) {
  if (!bagWeightGrams || grams <= 0) return null;
  const bags = Math.floor(grams / bagWeightGrams);
  const rest = grams - bags * bagWeightGrams;
  return { bags, restGrams: rest };
}

/** The date a monthly total is stored on: the month's last day, or today for the current month. */
export function monthlyEntryDate(month: string, today: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  return last < today ? last : today;
}

/**
 * Save "feed used this month" for several feed types at once (entered at month end).
 * One monthly total per feed type and month: changed if it exists, removed if cleared.
 */
export async function saveMonthlyFeeding(
  repo: LocalRepo,
  userId: string,
  newId: () => string,
  month: string,
  today: string,
  entries: { feedItemId: string; grams: number | null }[],
  existing: LocalRecord<FeedConsumption>[],
  animalIds: string[],
) {
  const date = monthlyEntryDate(month, today);
  for (const e of entries) {
    const cur = existing.find((c) => c.data.period === 'MONTH' && c.data.feedItemId === e.feedItemId && c.data.date.slice(0, 7) === month && !c.data.deletedAt);
    if (!e.grams) {
      if (cur) await repo.remove('FeedConsumption', userId, cur.id);
    } else if (!cur) {
      await repo.create('FeedConsumption', userId, newId(), { feedItemId: e.feedItemId, date, quantityGrams: e.grams, wastedGrams: 0, animalIds, period: 'MONTH', note: null });
    } else if (cur.data.quantityGrams !== e.grams) {
      await repo.update('FeedConsumption', userId, cur.id, { quantityGrams: e.grams });
    }
  }
}
