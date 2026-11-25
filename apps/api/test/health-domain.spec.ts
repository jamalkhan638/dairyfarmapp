/** Phone-side health & breeding logic (apps/mobile/src/domain/health.ts). */
import { addDays, computeReminders, DEFAULT_BREEDING, groupReminders, pregnancy, withdrawalUntil, type BreedingEvent, type HealthEvent } from '../../mobile/src/domain/health';
import type { AnimalView } from '../../mobile/src/domain/animals';

let n = 0;
const br = (date: string, type: BreedingEvent['type'], extra: Partial<BreedingEvent> = {}): BreedingEvent => ({
  id: `b${++n}`, animalId: 'A', date, type, method: null, sire: null, technician: null, result: null, calfId: null, calfSex: null, notes: null,
  createdById: 'u', createdAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`, deletedAt: null, ...extra,
});
const he = (date: string, type: HealthEvent['type'], extra: Partial<HealthEvent> = {}): HealthEvent => ({
  id: `h${++n}`, animalId: 'A', date, type, title: type, medicine: null, dose: null, vetName: null, withdrawalEndDate: null, nextDueDate: null,
  expenseId: null, notes: null, createdById: 'u', createdAt: '2026-01-01T00:00:00Z', deletedAt: null, ...extra,
});
const cow = (status = 'MILKING'): AnimalView => ({ animal: { id: 'A', tag: '1', sex: 'FEMALE' } as any, record: {} as any, status: status as any, statusDate: null, history: [] });

it('pregnancy status follows insemination, check and calving', () => {
  const ins = br('2026-03-01', 'INSEMINATION');
  expect(pregnancy([ins], 'A', DEFAULT_BREEDING).state).toBe('INSEMINATED');
  const pos = br('2026-05-01', 'PREGNANCY_CHECK', { result: 'PREGNANT' });
  const p = pregnancy([ins, pos], 'A', DEFAULT_BREEDING);
  expect(p).toMatchObject({ state: 'PREGNANT', expectedCalving: addDays('2026-03-01', 283) });
  expect(pregnancy([ins, pos], 'A', { ...DEFAULT_BREEDING, gestationDays: 310 }).expectedCalving).toBe(addDays('2026-03-01', 310)); // buffalo
  const neg = br('2026-05-01', 'PREGNANCY_CHECK', { result: 'NOT_PREGNANT' });
  expect(pregnancy([ins, neg], 'A', DEFAULT_BREEDING).state).toBe('OPEN');
  expect(pregnancy([ins, pos, br('2026-12-08', 'CALVING')], 'A', DEFAULT_BREEDING)).toMatchObject({ state: 'OPEN', lastCalving: '2026-12-08' });
});

it('withdrawal applies from the treatment day to the end date inclusive', () => {
  const h = [he('2026-11-10', 'TREATMENT', { withdrawalEndDate: '2026-11-14' })];
  expect(withdrawalUntil(h, 'A', '2026-11-09')).toBeNull();
  expect(withdrawalUntil(h, 'A', '2026-11-14')!.until).toBe('2026-11-14');
  expect(withdrawalUntil(h, 'A', '2026-11-15')).toBeNull();
});

it('automatic reminders appear and clear themselves when the follow-up is recorded', () => {
  const ins = br('2026-11-01', 'INSEMINATION');
  const base = { health: [] as HealthEvent[], reminders: [], settings: DEFAULT_BREEDING };
  let r = computeReminders([cow()], { ...base, breeding: [ins] }, '2026-11-25');
  expect(r.map((x) => [x.kind, x.dueDate])).toEqual([['HEAT_CHECK', '2026-11-22'], ['PREGNANCY_CHECK', '2026-12-31']]);
  expect(groupReminders(r, '2026-11-25').overdue.map((x) => x.kind)).toEqual(['HEAT_CHECK']);

  const pos = br('2026-12-31', 'PREGNANCY_CHECK', { result: 'PREGNANT' });
  r = computeReminders([cow()], { ...base, breeding: [ins, pos] }, '2027-01-01');
  expect(r.map((x) => x.kind)).toEqual(['DRY_OFF', 'CALVING']); // check done; milking cow gets a dry-off reminder
  expect(computeReminders([cow('DRY')], { ...base, breeding: [ins, pos] }, '2027-01-01').map((x) => x.kind)).toEqual(['CALVING']);
  expect(computeReminders([cow()], { ...base, breeding: [ins, pos, br('2027-08-10', 'CALVING')] }, '2027-08-11')).toEqual([]);
});

it('next vaccination clears when the next one is recorded; dismissed reminders stay hidden', () => {
  const v1 = he('2026-06-01', 'VACCINATION', { title: 'FMD', nextDueDate: '2026-12-01' });
  const base = { breeding: [] as BreedingEvent[], settings: DEFAULT_BREEDING };
  expect(computeReminders([cow()], { ...base, health: [v1], reminders: [] }, '2026-11-25')[0]).toMatchObject({ kind: 'NEXT_DUE', detail: 'FMD' });
  expect(computeReminders([cow()], { ...base, health: [v1, he('2026-12-02', 'VACCINATION')], reminders: [] }, '2026-12-03')).toEqual([]);
  const dismiss = { id: 'r', animalId: 'A', dueDate: '2026-12-01', title: 'x', sourceKey: `next:${v1.id}`, done: true, notes: null, deletedAt: null };
  expect(computeReminders([cow()], { ...base, health: [v1], reminders: [dismiss] }, '2026-11-25')).toEqual([]);
  // Sold animals get no reminders.
  expect(computeReminders([cow('SOLD')], { ...base, health: [v1], reminders: [] }, '2026-11-25')).toEqual([]);
});
