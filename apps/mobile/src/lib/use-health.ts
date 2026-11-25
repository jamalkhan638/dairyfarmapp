import { useLocalQuery } from './hooks';
import { local } from './db';
import { loadAnimals } from '../domain/animals';
import { computeReminders, loadHealth } from '../domain/health';
import { today } from './format';

/** Animals, health & breeding records, and the reminders worked out from them. */
export function useHealthData() {
  return useLocalQuery(async () => {
    const repo = local().repo;
    const [animals, h] = await Promise.all([loadAnimals(repo), loadHealth(repo)]);
    const plain = { health: h.health.map((x) => x.data), breeding: h.breeding.map((x) => x.data), reminders: h.reminders.map((x) => x.data), settings: h.settings };
    return { animals, ...h, plain, due: computeReminders(animals, plain, today()) };
  }).data;
}
