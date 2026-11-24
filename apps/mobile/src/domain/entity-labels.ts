import i18n from '../lib/i18n';
import { animalFieldLabel } from './animal-labels';

export function entityLabel(entity: string) {
  const map: Record<string, string> = { Animal: 'animal', AnimalStatusChange: 'status', Attachment: 'photo', SyncConflict: 'conflict' };
  return map[entity] ? i18n.t(map[entity]) : entity;
}

/** Field label for any record type (grows as modules are added). */
export function fieldLabel(_entity: string, field: string) {
  return animalFieldLabel(field);
}

/** A short name for a record, e.g. "#101 Rani". */
export function recordTitle(entity: string, data: Record<string, any> | null | undefined) {
  if (!data) return '';
  if (entity === 'Animal') return `#${data.tag ?? ''}${data.name ? ` ${data.name}` : ''}`;
  return '';
}
