import i18n from '../lib/i18n';
import { formatDate, formatPKR } from '../lib/format';

const t = (k: string) => i18n.t(k as any);

export function entityLabel(entity: string) {
  const map: Record<string, string> = {
    Animal: 'animal', AnimalStatusChange: 'status', Attachment: 'photo', SyncConflict: 'conflict', MilkRecord: 'milk', MilkUsage: 'usage',
  };
  return map[entity] ? t(map[entity]) : entity;
}

const FIELD_KEYS: Record<string, string> = {
  tag: 'tag', name: 'name', breed: 'breed', sex: 'sex', birthDate: 'birthDate', birthDateEstimated: 'birthDateEstimated',
  purchaseDate: 'purchaseDate', purchasePricePaisa: 'purchasePrice', motherId: 'mother', photoId: 'photo', notes: 'notes',
  status: 'status', statusDate: 'statusDate', effectiveDate: 'effectiveDate', reason: 'reason', animalId: 'animal', deletedAt: 'deleted',
  date: 'date', session: 'session', quantityMl: 'quantity', note: 'notes', type: 'type',
  role: 'role', active: 'activeAccount', permissions: 'permissions', password: 'password',
};

/** Field label for any record type. */
export function fieldLabel(_entity: string, field: string) {
  return FIELD_KEYS[field] ? t(FIELD_KEYS[field]) : field;
}

/** Show a stored value the way people read it (litres, rupees, dates, names of options). */
export function formatValue(_entity: string, field: string, v: unknown, animalTag?: (id: string) => string | undefined): string {
  if (v === null || v === undefined || v === '') return t('emptyValue');
  if (typeof v === 'boolean') return v ? t('yes') : t('no');
  if (field === 'quantityMl' && typeof v === 'number') return `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} ${t('L')}`;
  if (field === 'purchasePricePaisa' && typeof v === 'number') return formatPKR(v);
  if (['date', 'birthDate', 'purchaseDate', 'effectiveDate', 'statusDate'].includes(field) && typeof v === 'string') return formatDate(v);
  if (field === 'session') return v === 'MORNING' ? t('morning') : t('evening');
  if (field === 'status') return t(`s_${v}`);
  if (field === 'type') return t(`u_${v}`);
  if (field === 'sex') return v === 'FEMALE' ? t('female') : t('male');
  if ((field === 'animalId' || field === 'motherId') && typeof v === 'string') return animalTag?.(v) ? `#${animalTag(v)}` : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** A short name for a record, e.g. "#101 Rani". */
export function recordTitle(entity: string, data: Record<string, any> | null | undefined, animalTag?: (id: string) => string | undefined) {
  if (!data) return '';
  if (entity === 'Animal') return `#${data.tag ?? ''}${data.name ? ` ${data.name}` : ''}`;
  if (entity === 'MilkRecord') return `#${animalTag?.(data.animalId) ?? ''} · ${formatDate(data.date)} · ${data.session === 'MORNING' ? t('morning') : t('evening')}`;
  if (entity === 'MilkUsage') return `${t(`u_${data.type}`)} · ${formatDate(data.date)}`;
  return '';
}
