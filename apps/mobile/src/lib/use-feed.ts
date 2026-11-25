import { useLocalQuery } from './hooks';
import { local } from './db';
import { loadFeed } from '../domain/feed';
import { loadAnimals } from '../domain/animals';
import type { Expense } from '../domain/finance';

/** All feed records plus animals and expenses (for supplier balances), refreshed on every change. */
export function useFeedData() {
  return useLocalQuery(async () => ({
    ...(await loadFeed(local().repo)),
    animals: await loadAnimals(local().repo),
    expenses: (await local().repo.list<Expense>('Expense')).map((e) => e.data),
  })).data;
}
