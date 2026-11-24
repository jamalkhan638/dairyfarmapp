import { useLocalQuery } from './hooks';
import { local } from './db';
import { loadAnimals } from '../domain/animals';
import { loadMilk } from '../domain/milk';

/** Animals plus all milk records and uses on this phone, refreshed on every change. */
export function useMilkData() {
  const { data } = useLocalQuery(async () => {
    const repo = local().repo;
    const [animals, milk] = await Promise.all([loadAnimals(repo), loadMilk(repo)]);
    return { animals, records: milk.records, usages: milk.usages };
  });
  return data;
}
