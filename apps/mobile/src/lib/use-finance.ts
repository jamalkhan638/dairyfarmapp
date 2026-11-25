import { useLocalQuery } from './hooks';
import { local } from './db';
import { loadFinance } from '../domain/finance';
import { loadFeed } from '../domain/feed';
import { loadAnimals } from '../domain/animals';
import { loadSales } from '../domain/sales';

/** Money data plus the names needed to show it (suppliers, customers, feed items, animals). */
export function useFinanceData() {
  return useLocalQuery(async () => {
    const repo = local().repo;
    const [fin, feed, animals, sales] = await Promise.all([loadFinance(repo), loadFeed(repo), loadAnimals(repo), loadSales(repo)]);
    // Cash sales saved on this phone but not synced yet have no payment record here: count them as money in.
    const payIds = new Set(fin.customerPayments.map((p) => p.id));
    const cashSalesNotSynced = sales.deliveries
      .filter((d) => !d.data.deletedAt && d.data.saleType === 'CASH' && d.data.cashPaymentId && !payIds.has(d.data.cashPaymentId))
      .map((d) => ({ id: d.data.cashPaymentId!, customerId: d.data.customerId, date: d.data.date, amountPaisa: d.data.amountPaisa }));
    return { ...fin, suppliers: feed.suppliers, items: feed.items, animals, customers: sales.customers, cashSalesNotSynced };
  }).data;
}
