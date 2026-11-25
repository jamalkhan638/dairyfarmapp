import { useLocalQuery } from './hooks';
import { local } from './db';
import type { Animal } from '../domain/animals';
import type { Lookups } from '../domain/entity-labels';

/** id -> cow tag and customer name, for showing which cow or customer a record belongs to. */
export function useLookups(): Lookups {
  const { data } = useLocalQuery(async () => ({
    animals: await local().repo.list<Animal>('Animal', { includeDeleted: true }),
    customers: await local().repo.list<{ name: string }>('Customer', { includeDeleted: true }),
    items: await local().repo.list<{ name: string }>('FeedItem', { includeDeleted: true }),
    suppliers: await local().repo.list<{ name: string }>('Supplier', { includeDeleted: true }),
  }));
  const nameMap = (xs?: { id: string; data: { name: string } }[]) => new Map((xs ?? []).map((x) => [x.id, x.data.name]));
  const items = nameMap(data?.items);
  const suppliers = nameMap(data?.suppliers);
  const tags = new Map((data?.animals ?? []).map((a) => [a.id, a.data.tag]));
  const names = new Map((data?.customers ?? []).map((c) => [c.id, c.data.name]));
  return { tagOf: (id) => tags.get(id), customerOf: (id) => names.get(id), itemOf: (id) => items.get(id), supplierOf: (id) => suppliers.get(id) };
}

/** id -> tag only. */
export function useAnimalTags() {
  const l = useLookups();
  return l.tagOf!;
}
