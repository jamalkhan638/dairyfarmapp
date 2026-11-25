import {
  DEFAULT_GESTATION_DAYS, DEFAULT_HEAT_REPEAT_DAYS, DEFAULT_PREGNANCY_CHECK_DAYS, DRY_OFF_DAYS_BEFORE_CALVING, FARM_SETTINGS_ID,
  type BreedingType, type HealthType, type InseminationMethod, type PregnancyResult, type Sex,
} from '@dairy/shared';
import type { LocalRecord, LocalRepo } from '../sync/repo';
import type { AnimalView } from './animals';
import { isActive } from './animals';

export interface HealthEvent {
  id: string; animalId: string; date: string; type: HealthType; title: string; medicine: string | null; dose: string | null;
  vetName: string | null; withdrawalEndDate: string | null; nextDueDate: string | null; expenseId: string | null; notes: string | null;
  createdById: string; createdAt: string; deletedAt: string | null;
}
export interface BreedingEvent {
  id: string; animalId: string; date: string; type: BreedingType; method: InseminationMethod | null; sire: string | null; technician: string | null;
  result: PregnancyResult | null; calfId: string | null; calfSex: Sex | null; notes: string | null; createdById: string; createdAt: string; deletedAt: string | null;
}
export interface Reminder { id: string; animalId: string | null; dueDate: string; title: string; sourceKey: string | null; done: boolean; notes: string | null; deletedAt: string | null }

export interface BreedingSettings { gestationDays: number; pregnancyCheckDays: number; heatRepeatDays: number }
export const DEFAULT_BREEDING: BreedingSettings = { gestationDays: DEFAULT_GESTATION_DAYS, pregnancyCheckDays: DEFAULT_PREGNANCY_CHECK_DAYS, heatRepeatDays: DEFAULT_HEAT_REPEAT_DAYS };

export interface HealthData {
  health: LocalRecord<HealthEvent>[];
  breeding: LocalRecord<BreedingEvent>[];
  reminders: LocalRecord<Reminder>[];
  settings: BreedingSettings;
}

export async function loadHealth(repo: LocalRepo): Promise<HealthData> {
  const [health, breeding, reminders, s] = await Promise.all([
    repo.list<HealthEvent>('HealthEvent'), repo.list<BreedingEvent>('BreedingEvent'), repo.list<Reminder>('Reminder'),
    repo.get<Partial<BreedingSettings>>('FarmSettings', FARM_SETTINGS_ID),
  ]);
  return {
    health, breeding, reminders,
    settings: {
      gestationDays: s?.data.gestationDays ?? DEFAULT_BREEDING.gestationDays,
      pregnancyCheckDays: s?.data.pregnancyCheckDays ?? DEFAULT_BREEDING.pregnancyCheckDays,
      heatRepeatDays: s?.data.heatRepeatDays ?? DEFAULT_BREEDING.heatRepeatDays,
    },
  };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000);
}

const live = <T extends { deletedAt: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
const byDate = <T extends { date: string; createdAt: string }>(a: T, b: T) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date));

export type PregnancyState = 'OPEN' | 'INSEMINATED' | 'PREGNANT';
export interface Pregnancy {
  state: PregnancyState;
  /** Date of the event that set this state. */
  since: string | null;
  lastInsemination: BreedingEvent | null;
  /** For PREGNANT: last insemination before the positive check + gestation days. */
  expectedCalving: string | null;
  lastCalving: string | null;
}

/** Pregnancy status from breeding records. Separate from milking status. */
export function pregnancy(events: BreedingEvent[], animalId: string, s: BreedingSettings): Pregnancy {
  const list = live(events).filter((e) => e.animalId === animalId).sort(byDate);
  let p: Pregnancy = { state: 'OPEN', since: null, lastInsemination: null, expectedCalving: null, lastCalving: null };
  for (const e of list) {
    if (e.type === 'INSEMINATION') {
      p = { ...p, state: 'INSEMINATED', since: e.date, lastInsemination: e, expectedCalving: null };
    } else if (e.type === 'PREGNANCY_CHECK') {
      if (e.result === 'PREGNANT') {
        const ins = p.lastInsemination;
        p = { ...p, state: 'PREGNANT', since: e.date, expectedCalving: ins ? addDays(ins.date, s.gestationDays) : null };
      } else {
        p = { ...p, state: 'OPEN', since: e.date, expectedCalving: null };
      }
    } else if (e.type === 'CALVING' || e.type === 'ABORTION') {
      p = { ...p, state: 'OPEN', since: e.date, expectedCalving: null, lastInsemination: null, lastCalving: e.type === 'CALVING' ? e.date : p.lastCalving };
    }
  }
  return p;
}

/** Latest withdrawal end date that still applies on this date (milk must not be sold), or null. */
export function withdrawalUntil(health: HealthEvent[], animalId: string, date: string): { until: string; event: HealthEvent } | null {
  let best: { until: string; event: HealthEvent } | null = null;
  for (const h of live(health)) {
    if (h.animalId !== animalId || !h.withdrawalEndDate) continue;
    if (h.date <= date && h.withdrawalEndDate >= date && (!best || h.withdrawalEndDate > best.until)) best = { until: h.withdrawalEndDate, event: h };
  }
  return best;
}

export type ReminderKind = 'NEXT_DUE' | 'PREGNANCY_CHECK' | 'HEAT_CHECK' | 'DRY_OFF' | 'CALVING' | 'WITHDRAWAL_END' | 'CUSTOM';
export interface DueReminder {
  /** Stable key: automatic ones are recomputed, dismissing one stores this key. */
  key: string;
  kind: ReminderKind;
  animalId: string | null;
  dueDate: string;
  /** Extra text: health event title, or the custom reminder's title. */
  detail: string | null;
  healthType?: HealthType;
  /** The custom reminder record, if this is one. */
  reminderId?: string;
}

/**
 * Reminders worked out from the records, so they never go stale or get duplicated:
 * an automatic reminder disappears by itself once the matching record is entered.
 */
export function computeReminders(animals: AnimalView[], d: { health: HealthEvent[]; breeding: BreedingEvent[]; reminders: Reminder[]; settings: BreedingSettings }, today: string): DueReminder[] {
  const onFarm = new Map(animals.filter((a) => isActive(a.status)).map((a) => [a.animal.id, a]));
  const dismissed = new Set(live(d.reminders).filter((r) => r.sourceKey && r.done).map((r) => r.sourceKey!));
  const out: DueReminder[] = [];
  const add = (r: DueReminder) => {
    if (!dismissed.has(r.key) && (!r.animalId || onFarm.has(r.animalId))) out.push(r);
  };
  const health = live(d.health);
  const breeding = live(d.breeding);

  // Next vaccination / deworming / follow-up: done when a later record of the same type exists.
  for (const h of health) {
    if (!h.nextDueDate) continue;
    const repeated = health.some((x) => x.id !== h.id && x.animalId === h.animalId && x.type === h.type && x.date > h.date);
    if (!repeated) add({ key: `next:${h.id}`, kind: 'NEXT_DUE', animalId: h.animalId, dueDate: h.nextDueDate, detail: h.title, healthType: h.type });
  }
  // Milk withdrawal ending: shown until the day after it ends.
  for (const h of health) {
    if (h.withdrawalEndDate && h.withdrawalEndDate >= today) add({ key: `wd:${h.id}`, kind: 'WITHDRAWAL_END', animalId: h.animalId, dueDate: h.withdrawalEndDate, detail: h.title });
  }
  // Breeding follow-ups.
  for (const [id, a] of onFarm) {
    if (a.animal.sex !== 'FEMALE') continue;
    const list = breeding.filter((e) => e.animalId === id).sort(byDate);
    const last = list[list.length - 1];
    if (last?.type === 'INSEMINATION') {
      add({ key: `heat:${last.id}`, kind: 'HEAT_CHECK', animalId: id, dueDate: addDays(last.date, d.settings.heatRepeatDays), detail: null });
      add({ key: `pcheck:${last.id}`, kind: 'PREGNANCY_CHECK', animalId: id, dueDate: addDays(last.date, d.settings.pregnancyCheckDays), detail: null });
    }
    const p = pregnancy(breeding, id, d.settings);
    if (p.state === 'PREGNANT' && p.expectedCalving) {
      const base = p.lastInsemination?.id ?? p.since;
      add({ key: `calving:${base}`, kind: 'CALVING', animalId: id, dueDate: p.expectedCalving, detail: null });
      if (a.status === 'MILKING') add({ key: `dryoff:${base}`, kind: 'DRY_OFF', animalId: id, dueDate: addDays(p.expectedCalving, -DRY_OFF_DAYS_BEFORE_CALVING), detail: null });
    }
  }
  // Reminders people added themselves.
  for (const r of live(d.reminders)) {
    if (!r.sourceKey && !r.done) out.push({ key: `custom:${r.id}`, kind: 'CUSTOM', animalId: r.animalId, dueDate: r.dueDate, detail: r.title, reminderId: r.id });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Split reminders into overdue, due today, and the next N days. */
export function groupReminders(list: DueReminder[], today: string, aheadDays = 30) {
  const end = addDays(today, aheadDays);
  return {
    overdue: list.filter((r) => r.dueDate < today && r.kind !== 'WITHDRAWAL_END'),
    today: list.filter((r) => r.dueDate === today),
    upcoming: list.filter((r) => r.dueDate > today && r.dueDate <= end),
  };
}
