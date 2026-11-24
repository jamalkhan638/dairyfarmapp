import { useLocalQuery } from './hooks';
import { local } from './db';
import type { Animal } from '../domain/animals';

/** id -> tag, for showing which cow a record belongs to. */
export function useAnimalTags() {
  const { data } = useLocalQuery(() => local().repo.list<Animal>('Animal', { includeDeleted: true }));
  const map = new Map((data ?? []).map((a) => [a.id, a.data.tag]));
  return (id: string) => map.get(id);
}
