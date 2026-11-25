import { saleAmountPaisa, type MilkSession, type PaymentMethod, type SaleType } from '@dairy/shared';
import type { LocalRecord, LocalRepo } from '../sync/repo';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  defaultSaleType: SaleType;
  active: boolean;
  createdById: string;
  deletedAt: string | null;
}
export interface CustomerRate {
  id: string;
  customerId: string;
  ratePaisaPerLitre: number;
  effectiveFrom: string;
  note: string | null;
  createdAt: string;
  deletedAt: string | null;
}
export interface MilkDelivery {
  id: string;
  customerId: string;
  date: string;
  session: MilkSession;
  quantityMl: number;
  ratePaisaPerLitre: number;
  amountPaisa: number;
  saleType: SaleType;
  cashPaymentId: string | null;
  note: string | null;
  createdById: string;
  clientCreatedAt?: string | null;
  createdAt?: string;
  deletedAt: string | null;
}
export interface CustomerPayment {
  id: string;
  customerId: string;
  date: string;
  amountPaisa: number;
  method: PaymentMethod;
  deliveryId: string | null;
  note: string | null;
  createdById: string;
  clientCreatedAt?: string | null;
  createdAt?: string;
  deletedAt: string | null;
}

export interface SalesData {
  customers: LocalRecord<Customer>[];
  rates: LocalRecord<CustomerRate>[];
  deliveries: LocalRecord<MilkDelivery>[];
  payments: LocalRecord<CustomerPayment>[];
}

export async function loadSales(repo: LocalRepo): Promise<SalesData> {
  const [customers, rates, deliveries, payments] = await Promise.all([
    repo.list<Customer>('Customer'),
    repo.list<CustomerRate>('CustomerRate'),
    repo.list<MilkDelivery>('MilkDelivery'),
    repo.list<CustomerPayment>('CustomerPayment'),
  ]);
  customers.sort((a, b) => a.data.name.localeCompare(b.data.name));
  return { customers, rates, deliveries, payments };
}

/** The customer's rate on a date: the latest rate that started on or before it. */
export function rateOn(rates: CustomerRate[], customerId: string, date: string): CustomerRate | null {
  const list = rates.filter((r) => r.customerId === customerId && !r.deletedAt && r.effectiveFrom <= date);
  list.sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? a.createdAt.localeCompare(b.createdAt) : a.effectiveFrom.localeCompare(b.effectiveFrom)));
  return list[list.length - 1] ?? null;
}

/**
 * Payments counted for balances. A cash sale saved on this phone but not yet synced
 * has no payment record here yet (the server creates it), so it is counted as paid.
 */
function effectivePayments(deliveries: MilkDelivery[], payments: CustomerPayment[]): { customerId: string; date: string; amountPaisa: number }[] {
  const ids = new Set(payments.map((p) => p.id));
  const out = payments.filter((p) => !p.deletedAt).map((p) => ({ customerId: p.customerId, date: p.date, amountPaisa: p.amountPaisa }));
  for (const d of deliveries) {
    if (!d.deletedAt && d.saleType === 'CASH' && d.cashPaymentId && !ids.has(d.cashPaymentId)) out.push({ customerId: d.customerId, date: d.date, amountPaisa: d.amountPaisa });
  }
  return out;
}

export interface Balance {
  customerId: string;
  deliveredMl: number;
  billedPaisa: number;
  paidPaisa: number;
  /** Positive = customer owes the farm. Negative = paid in advance. */
  balancePaisa: number;
}

export function balances(deliveries: MilkDelivery[], payments: CustomerPayment[], range?: { from?: string; to?: string }): Map<string, Balance> {
  const inRange = (d: string) => (!range?.from || d >= range.from) && (!range?.to || d <= range.to);
  const map = new Map<string, Balance>();
  const get = (id: string) => {
    if (!map.has(id)) map.set(id, { customerId: id, deliveredMl: 0, billedPaisa: 0, paidPaisa: 0, balancePaisa: 0 });
    return map.get(id)!;
  };
  for (const d of deliveries) {
    if (d.deletedAt || !inRange(d.date)) continue;
    const b = get(d.customerId);
    b.deliveredMl += d.quantityMl;
    b.billedPaisa += d.amountPaisa;
  }
  for (const p of effectivePayments(deliveries, payments)) {
    if (!inRange(p.date)) continue;
    get(p.customerId).paidPaisa += p.amountPaisa;
  }
  for (const b of map.values()) b.balancePaisa = b.billedPaisa - b.paidPaisa;
  return map;
}

export type LedgerLine =
  | { kind: 'delivery'; date: string; id: string; delivery: MilkDelivery; balanceAfter: number }
  | { kind: 'payment'; date: string; id: string; payment: CustomerPayment; balanceAfter: number };

/** Customer statement: deliveries and payments by date with the running balance. */
export function ledger(customerId: string, deliveries: MilkDelivery[], payments: CustomerPayment[]): LedgerLine[] {
  const lines: Omit<LedgerLine, 'balanceAfter'>[] = [];
  for (const d of deliveries) if (d.customerId === customerId && !d.deletedAt) lines.push({ kind: 'delivery', date: d.date, id: d.id, delivery: d } as any);
  for (const p of payments) if (p.customerId === customerId && !p.deletedAt) lines.push({ kind: 'payment', date: p.date, id: p.id, payment: p } as any);
  // Same day: deliveries (morning first) before payments.
  const order = (l: any) => (l.kind === 'delivery' ? (l.delivery.session === 'MORNING' ? 0 : 1) : 2);
  lines.sort((a, b) => (a.date === b.date ? order(a) - order(b) : a.date.localeCompare(b.date)));
  // Unsynced cash sales: include their payment so the statement balances.
  const paymentIds = new Set(payments.map((p) => p.id));
  let bal = 0;
  const out: LedgerLine[] = [];
  for (const l of lines as any[]) {
    if (l.kind === 'delivery') {
      bal += l.delivery.amountPaisa;
      out.push({ ...l, balanceAfter: bal });
      const d: MilkDelivery = l.delivery;
      if (d.saleType === 'CASH' && d.cashPaymentId && !paymentIds.has(d.cashPaymentId)) {
        bal -= d.amountPaisa;
        out.push({ kind: 'payment', date: d.date, id: d.cashPaymentId, balanceAfter: bal, payment: { id: d.cashPaymentId, customerId, date: d.date, amountPaisa: d.amountPaisa, method: 'CASH', deliveryId: d.id, note: null, createdById: d.createdById, deletedAt: null } });
      }
    } else {
      bal -= l.payment.amountPaisa;
      out.push({ ...l, balanceAfter: bal });
    }
  }
  return out;
}

/** Litres of milk delivered to customers per date (the "sold" line on milk screens). */
export function soldByDate(deliveries: MilkDelivery[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of deliveries) if (!d.deletedAt) out[d.date] = (out[d.date] ?? 0) + d.quantityMl;
  return out;
}

export type RoundChange = { customerId: string; ml: number | null; saleType: SaleType; ratePaisaPerLitre: number };

/**
 * Save a delivery round (one milking, many customers). New entries are added,
 * changed litres or rate edited, cleared entries deleted (with their cash payment).
 */
export async function saveRound(
  repo: LocalRepo,
  userId: string,
  newId: () => string,
  date: string,
  session: MilkSession,
  changes: RoundChange[],
  existing: LocalRecord<MilkDelivery>[],
) {
  const result = { added: 0, updated: 0, deleted: 0 };
  for (const c of changes) {
    const cur = existing.find((d) => d.data.customerId === c.customerId && d.data.date === date && d.data.session === session && !d.data.deletedAt);
    if (c.ml === null) {
      if (cur) {
        await repo.remove('MilkDelivery', userId, cur.id);
        result.deleted++;
      }
      continue;
    }
    const amountPaisa = saleAmountPaisa(c.ml, c.ratePaisaPerLitre);
    if (!cur) {
      const cashPaymentId = c.saleType === 'CASH' ? newId() : null;
      const send = { customerId: c.customerId, date, session, quantityMl: c.ml, ratePaisaPerLitre: c.ratePaisaPerLitre, saleType: c.saleType, cashPaymentId, note: null };
      await repo.create('MilkDelivery', userId, newId(), send, { ...send, amountPaisa });
      result.added++;
    } else if (cur.data.quantityMl !== c.ml || cur.data.ratePaisaPerLitre !== c.ratePaisaPerLitre) {
      // amountPaisa is for this phone's display; the server recalculates it.
      await repo.update('MilkDelivery', userId, cur.id, { quantityMl: c.ml, ratePaisaPerLitre: c.ratePaisaPerLitre, amountPaisa });
      result.updated++;
    }
  }
  return result;
}

/** "1,250" or "1,250.50" rupees typed by the user, into paisa. */
export function parseRupees(text: string): number | null | 'invalid' {
  const t = text.trim().replace(/,/g, '');
  if (t === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return 'invalid';
  return Math.round(Number(t) * 100);
}
