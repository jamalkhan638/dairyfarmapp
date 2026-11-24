/** Phone-side milk calculations (pure functions from apps/mobile/src/domain/milk.ts). */
import { farmToday } from '@dairy/shared';
import { parseLitres, statusOn, summarizeDay, summarizeMonth, type MilkRecord } from '../../mobile/src/domain/milk';
import type { AnimalView } from '../../mobile/src/domain/animals';

const cow = (id: string, history: { status: any; effectiveDate: string }[], sex: 'FEMALE' | 'MALE' = 'FEMALE'): AnimalView =>
  ({
    animal: { id, tag: id, sex } as any,
    record: {} as any,
    status: history[history.length - 1]?.status,
    statusDate: null,
    history: history.map((h, i) => ({ id: `${id}-${i}`, animalId: id, reason: null, createdAt: `2026-01-01T00:00:0${i}Z`, createdById: 'u', clientCreatedAt: null, deletedAt: null, ...h })),
  }) as AnimalView;

const rec = (animalId: string, date: string, session: 'MORNING' | 'EVENING', litres: number): MilkRecord =>
  ({ id: `${animalId}${date}${session}`, animalId, date, session, quantityMl: litres * 1000, note: null, deletedAt: null } as MilkRecord);

const A = cow('A', [{ status: 'MILKING', effectiveDate: '2026-10-01' }]);
const B = cow('B', [{ status: 'MILKING', effectiveDate: '2026-10-01' }, { status: 'DRY', effectiveDate: '2026-11-10' }]);
const C = cow('C', [{ status: 'YOUNG', effectiveDate: '2026-10-01' }]);
const BULL = cow('BULL', [{ status: 'MILKING', effectiveDate: '2026-10-01' }], 'MALE');

it('status on a date follows the status history', () => {
  expect(statusOn(B, '2026-11-09')).toBe('MILKING');
  expect(statusOn(B, '2026-11-10')).toBe('DRY');
  expect(statusOn(B, '2026-09-01')).toBeNull();
});

it('missing entries are reported as missing, not counted as zero', () => {
  const s = summarizeDay('2026-11-05', [A, B, C, BULL], [rec('A', '2026-11-05', 'MORNING', 10), rec('A', '2026-11-05', 'EVENING', 8), rec('B', '2026-11-05', 'MORNING', 0)], []);
  expect(s.producedMl).toBe(18000);
  expect(s.expected).toBe(4); // A and B milking, 2 sessions; calf and bull excluded
  expect(s.recorded).toBe(3); // a recorded 0 counts as recorded
  expect(s.missing.map((m) => `${m.animal.animal.id}:${m.session}`)).toEqual(['B:EVENING']);
  expect(s.complete).toBe(false);
});

it('dry cows are not expected; usage reduces what remains', () => {
  const s = summarizeDay('2026-11-12', [A, B], [rec('A', '2026-11-12', 'MORNING', 10), rec('A', '2026-11-12', 'EVENING', 9)], [
    { id: 'u1', date: '2026-11-12', type: 'CALF_FED', quantityMl: 3000, animalId: null, note: null, deletedAt: null },
    { id: 'u2', date: '2026-11-12', type: 'HOME', quantityMl: 2000, animalId: null, note: null, deletedAt: null },
  ], 12000);
  expect(s.expected).toBe(2);
  expect(s.complete).toBe(true);
  expect(s.remainingMl).toBe(19000 - 12000 - 3000 - 2000);
});

it('month summary counts coverage and marks the current month in progress', () => {
  const m = summarizeMonth('2026-10', [A], [rec('A', '2026-10-01', 'MORNING', 10)], []);
  expect(m.days).toHaveLength(31);
  expect(m.expected).toBe(62);
  expect(m.recorded).toBe(1);
  expect(m.inProgress).toBe(false);
  expect(summarizeMonth(farmToday().slice(0, 7), [A], [], []).inProgress).toBe(true);
});

it('parses typed litres', () => {
  expect(parseLitres('12.5')).toBe(12500);
  expect(parseLitres('12,25')).toBe(12250);
  expect(parseLitres(' ')).toBeNull();
  expect(parseLitres('0')).toBe(0);
  expect(parseLitres('abc')).toBe('invalid');
});
