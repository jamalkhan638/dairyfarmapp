import { farmToday, type AnimalStatus, type MilkSession, type MilkUsageType } from '@dairy/shared';
import type { LocalRecord, LocalRepo } from '../sync/repo';
import type { AnimalView } from './animals';

export interface MilkRecord {
  id: string;
  animalId: string;
  date: string;
  session: MilkSession;
  quantityMl: number;
  note: string | null;
  createdById: string;
  updatedById: string;
  version: number;
  deletedAt: string | null;
}

export interface MilkUsage {
  id: string;
  date: string;
  type: MilkUsageType;
  quantityMl: number;
  animalId: string | null;
  note: string | null;
  deletedAt: string | null;
}

/** The animal's status on a given date, from its status history. */
export function statusOn(a: AnimalView, date: string): AnimalStatus | null {
  const entries = a.history.filter((h) => !h.deletedAt && h.effectiveDate <= date);
  if (entries.length) {
    entries.sort((x, y) => (x.effectiveDate === y.effectiveDate ? x.createdAt.localeCompare(y.createdAt) : x.effectiveDate.localeCompare(y.effectiveDate)));
    return entries[entries.length - 1].status;
  }
  // History not downloaded yet (new animal on this phone): use the starting status.
  if (!a.history.length && a.statusDate && a.statusDate <= date) return a.status;
  return null;
}

/** Cows that should have been milked on this date. */
export function milkingOn(animals: AnimalView[], date: string) {
  return animals.filter((a) => a.animal.sex === 'FEMALE' && statusOn(a, date) === 'MILKING');
}

export interface DaySummary {
  date: string;
  morningMl: number;
  eveningMl: number;
  producedMl: number;
  /** Entries recorded vs entries expected (milking cows × 2 milkings). */
  recorded: number;
  expected: number;
  missing: { animal: AnimalView; session: MilkSession }[];
  usedMl: Record<MilkUsageType, number>;
  soldMl: number;
  remainingMl: number;
  isToday: boolean;
  complete: boolean;
}

export function summarizeDay(date: string, animals: AnimalView[], records: MilkRecord[], usages: MilkUsage[], soldMl = 0): DaySummary {
  const day = records.filter((r) => r.date === date && !r.deletedAt);
  const sum = (rs: MilkRecord[]) => rs.reduce((t, r) => t + r.quantityMl, 0);
  const morningMl = sum(day.filter((r) => r.session === 'MORNING'));
  const eveningMl = sum(day.filter((r) => r.session === 'EVENING'));
  const have = new Set(day.map((r) => `${r.animalId}:${r.session}`));
  const expectedCows = milkingOn(animals, date);
  const missing: DaySummary['missing'] = [];
  for (const a of expectedCows) for (const s of ['MORNING', 'EVENING'] as const) if (!have.has(`${a.animal.id}:${s}`)) missing.push({ animal: a, session: s });
  const usedMl: Record<MilkUsageType, number> = { CALF_FED: 0, HOME: 0, DISCARDED: 0 };
  for (const u of usages) if (u.date === date && !u.deletedAt) usedMl[u.type] += u.quantityMl;
  const producedMl = morningMl + eveningMl;
  const expected = expectedCows.length * 2;
  // Entries for cows not expected (e.g. marked dry later) still count as recorded.
  const recorded = expected - missing.length;
  return {
    date, morningMl, eveningMl, producedMl, recorded, expected, missing, usedMl, soldMl,
    remainingMl: producedMl - soldMl - usedMl.CALF_FED - usedMl.HOME - usedMl.DISCARDED,
    isToday: date === farmToday(),
    complete: missing.length === 0,
  };
}

export interface MonthSummary {
  month: string; // YYYY-MM
  days: DaySummary[];
  producedMl: number;
  usedMl: Record<MilkUsageType, number>;
  soldMl: number;
  recorded: number;
  expected: number;
  inProgress: boolean;
  complete: boolean;
}

export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = farmToday();
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    if (date <= today) out.push(date);
  }
  return out;
}

export function summarizeMonth(month: string, animals: AnimalView[], records: MilkRecord[], usages: MilkUsage[], soldByDate: Record<string, number> = {}): MonthSummary {
  const days = daysOfMonth(month).map((d) => summarizeDay(d, animals, records, usages, soldByDate[d] ?? 0));
  const usedMl: Record<MilkUsageType, number> = { CALF_FED: 0, HOME: 0, DISCARDED: 0 };
  for (const d of days) for (const k of Object.keys(usedMl) as MilkUsageType[]) usedMl[k] += d.usedMl[k];
  const recorded = days.reduce((t, d) => t + d.recorded, 0);
  const expected = days.reduce((t, d) => t + d.expected, 0);
  return {
    month,
    days,
    producedMl: days.reduce((t, d) => t + d.producedMl, 0),
    usedMl,
    soldMl: days.reduce((t, d) => t + d.soldMl, 0),
    recorded,
    expected,
    inProgress: farmToday().slice(0, 7) === month,
    complete: recorded >= expected,
  };
}

export async function loadMilk(repo: LocalRepo) {
  const [records, usages] = await Promise.all([repo.list<MilkRecord>('MilkRecord'), repo.list<MilkUsage>('MilkUsage')]);
  return { records, usages };
}

/** Parse what the user typed ("12.5", "12,5", "") into ml. Empty means "not recorded". */
export function parseLitres(text: string): number | null | 'invalid' {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{0,3})?$/.test(t)) return 'invalid';
  return Math.round(Number(t) * 1000);
}

export type SessionChange = { animalId: string; ml: number | null };

/**
 * Save one milking for many cows at once. New values are added, changed values
 * edited, cleared values deleted. Returns what was done.
 */
export async function saveMilkSession(
  repo: LocalRepo,
  userId: string,
  newId: () => string,
  date: string,
  session: MilkSession,
  changes: SessionChange[],
  existing: LocalRecord<MilkRecord>[],
) {
  const result = { added: 0, updated: 0, deleted: 0 };
  for (const c of changes) {
    const cur = existing.find((r) => r.data.animalId === c.animalId && r.data.date === date && r.data.session === session && !r.data.deletedAt);
    if (c.ml === null) {
      if (cur) {
        await repo.remove('MilkRecord', userId, cur.id);
        result.deleted++;
      }
    } else if (!cur) {
      await repo.create('MilkRecord', userId, newId(), { animalId: c.animalId, date, session, quantityMl: c.ml, note: null });
      result.added++;
    } else if (cur.data.quantityMl !== c.ml) {
      await repo.update('MilkRecord', userId, cur.id, { quantityMl: c.ml });
      result.updated++;
    }
  }
  return result;
}

export const litres = (ml: number) => (ml / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 });
