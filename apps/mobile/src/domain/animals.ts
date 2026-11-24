import { ACTIVE_STATUSES, animalFields, type AnimalStatus, type Sex } from '@dairy/shared';
import type { LocalRecord, LocalRepo } from '../sync/repo';

export interface Animal {
  id: string;
  tag: string;
  name: string | null;
  breed: string | null;
  sex: Sex;
  birthDate: string | null;
  birthDateEstimated: boolean;
  purchaseDate: string | null;
  purchasePricePaisa: number | null;
  motherId: string | null;
  photoId: string | null;
  notes: string | null;
  status: AnimalStatus;
  statusDate: string | null;
  createdById: string;
  clientCreatedAt: string | null;
  createdAt: string;
  updatedById: string;
  clientUpdatedAt: string | null;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
}

export interface StatusChange {
  id: string;
  animalId: string;
  status: AnimalStatus;
  effectiveDate: string;
  reason: string | null;
  createdAt: string;
  createdById: string;
  clientCreatedAt: string | null;
  deletedAt: string | null;
}

export type AnimalForm = {
  tag: string;
  name?: string | null;
  breed?: string | null;
  sex: Sex;
  birthDate?: string | null;
  birthDateEstimated: boolean;
  purchaseDate?: string | null;
  purchasePricePaisa?: number | null;
  notes?: string | null;
};

/** Latest status entry by date (then by entry time) decides the current status. */
export function currentStatus(changes: StatusChange[]): StatusChange | null {
  const live = changes.filter((c) => !c.deletedAt);
  live.sort((a, b) => (a.effectiveDate === b.effectiveDate ? a.createdAt.localeCompare(b.createdAt) : a.effectiveDate.localeCompare(b.effectiveDate)));
  return live[live.length - 1] ?? null;
}

export interface AnimalView {
  record: LocalRecord<Animal>;
  animal: Animal;
  status: AnimalStatus;
  statusDate: string | null;
  history: StatusChange[];
}

/** Animals with their status worked out on the phone, so unsent status changes show at once. */
export async function loadAnimals(repo: LocalRepo): Promise<AnimalView[]> {
  const [animals, changes] = await Promise.all([repo.list<Animal>('Animal'), repo.list<StatusChange>('AnimalStatusChange')]);
  const byAnimal = new Map<string, StatusChange[]>();
  for (const c of changes) byAnimal.set(c.data.animalId, [...(byAnimal.get(c.data.animalId) ?? []), c.data]);
  return animals
    .map((record) => {
      const history = (byAnimal.get(record.id) ?? []).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
      const latest = currentStatus(history);
      return { record, animal: record.data, history, status: latest?.status ?? record.data.status, statusDate: latest?.effectiveDate ?? record.data.statusDate };
    })
    .sort((a, b) => a.animal.tag.localeCompare(b.animal.tag, undefined, { numeric: true }));
}

export const isActive = (s: AnimalStatus) => ACTIVE_STATUSES.includes(s);

export function validateAnimalForm(form: AnimalForm): string | null {
  const r = animalFields.partial().safeParse(form);
  if (!form.tag?.trim()) return 'tagRequired';
  if (!r.success) return r.error.issues[0]?.message ?? 'invalid';
  return null;
}

export async function addAnimal(
  repo: LocalRepo,
  userId: string,
  newId: () => string,
  form: AnimalForm,
  initial: { status: AnimalStatus; date: string },
): Promise<string> {
  const id = newId();
  const statusChangeId = newId();
  const clean = { ...form, tag: form.tag.trim() };
  await repo.create('Animal', userId, id, { ...clean, initialStatus: initial.status, initialStatusDate: initial.date, initialStatusChangeId: statusChangeId }, { ...clean, status: initial.status, statusDate: initial.date, motherId: null, photoId: null });
  // The server records the starting status as the first status-history entry (with
  // statusChangeId). Until then the phone shows the status stored on the animal itself.
  return id;
}

export async function changeStatus(repo: LocalRepo, userId: string, newId: () => string, animalId: string, status: AnimalStatus, date: string, reason: string | null) {
  const id = newId();
  await repo.create('AnimalStatusChange', userId, id, { animalId, status, effectiveDate: date, reason });
  return id;
}
