import { useLocalQuery } from './hooks';
import { local } from './db';
import { loadSales } from '../domain/sales';

/** Customers, rates, deliveries and payments on this phone, refreshed on every change. */
export function useSalesData() {
  return useLocalQuery(() => loadSales(local().repo)).data;
}
