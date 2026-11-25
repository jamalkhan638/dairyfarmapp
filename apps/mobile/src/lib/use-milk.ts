import { useLocalQuery } from './hooks';
import { local } from './db';
import { useSession } from './session';
import { loadAnimals } from '../domain/animals';
import { loadMilk } from '../domain/milk';
import { soldByDate, type MilkDelivery } from '../domain/sales';
import type { HealthEvent } from '../domain/health';

/**
 * Animals, milk records and uses on this phone, refreshed on every change.
 * soldByDate is null when the user cannot see sales (then "Sold" shows as unknown).
 */
export function useMilkData() {
  const { can } = useSession();
  const seesSales = can('sales', 'view');
  const { data } = useLocalQuery(async () => {
    const repo = local().repo;
    const [animals, milk, deliveries, health] = await Promise.all([loadAnimals(repo), loadMilk(repo), seesSales ? repo.list<MilkDelivery>('MilkDelivery') : Promise.resolve([]), repo.list<HealthEvent>('HealthEvent')]);
    return { animals, records: milk.records, usages: milk.usages, health: health.map((h) => h.data), soldByDate: seesSales ? soldByDate(deliveries.map((d) => d.data)) : null };
  }, [seesSales]);
  return data;
}
