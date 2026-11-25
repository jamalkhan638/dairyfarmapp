import { useLocalQuery } from './hooks';
import { local } from './db';
import { loadFeed } from '../domain/feed';
import { loadAnimals } from '../domain/animals';

/** All feed records plus animals, refreshed on every change. */
export function useFeedData() {
  return useLocalQuery(async () => ({ ...(await loadFeed(local().repo)), animals: await loadAnimals(local().repo) })).data;
}
