import type { ExpenseCategory, HealthType, Sex } from '@dairy/shared';
import type { LocalRepo } from '../sync/repo';
import { addAnimal, changeStatus } from './animals';

export interface HealthForm {
  animalId: string; date: string; type: HealthType; title: string; medicine: string | null; dose: string | null; vetName: string | null;
  withdrawalEndDate: string | null; nextDueDate: string | null; notes: string | null;
}

/**
 * Save a health record. If a cost is given, it is saved once, as an expense for
 * this animal; the health record only points to it (no double counting).
 */
export async function addHealthEvent(repo: LocalRepo, userId: string, newId: () => string, form: HealthForm, cost?: { amountPaisa: number; category: ExpenseCategory } | null) {
  let expenseId: string | null = null;
  if (cost && cost.amountPaisa > 0) {
    expenseId = newId();
    await repo.create('Expense', userId, expenseId, {
      date: form.date, category: cost.category, amountPaisa: cost.amountPaisa, description: form.title, supplierId: null,
      paymentType: 'CASH', method: 'CASH', cashPaymentId: null, animalId: form.animalId, receiptPhotoId: null,
    });
  }
  const id = newId();
  await repo.create('HealthEvent', userId, id, { ...form, expenseId });
  return id;
}

/**
 * Record a calving. Optionally add the calf as a new animal (linked to its mother)
 * and mark the mother as milking from that day.
 */
export async function recordCalving(
  repo: LocalRepo, userId: string, newId: () => string,
  p: { motherId: string; date: string; notes: string | null; calf: { tag: string; sex: Sex } | null; calfSexOnly: Sex | null; motherStartsMilking: boolean },
) {
  let calfId: string | null = null;
  if (p.calf) {
    calfId = await addAnimal(repo, userId, newId, { tag: p.calf.tag, sex: p.calf.sex, birthDate: p.date, birthDateEstimated: false, motherId: p.motherId }, { status: 'YOUNG', date: p.date });
  }
  const id = newId();
  await repo.create('BreedingEvent', userId, id, { animalId: p.motherId, date: p.date, type: 'CALVING', calfId, calfSex: p.calf?.sex ?? p.calfSexOnly, notes: p.notes });
  if (p.motherStartsMilking) await changeStatus(repo, userId, newId, p.motherId, 'MILKING', p.date, 'Calved');
  return { id, calfId };
}

/** Mark an automatic reminder as done (stores its key) or a custom one as done. */
export async function completeReminder(repo: LocalRepo, userId: string, newId: () => string, r: { key: string; animalId: string | null; dueDate: string; reminderId?: string; title: string }) {
  if (r.reminderId) return repo.update('Reminder', userId, r.reminderId, { done: true });
  return repo.create('Reminder', userId, newId(), { animalId: r.animalId, dueDate: r.dueDate, title: r.title, sourceKey: r.key, done: true, notes: null });
}
