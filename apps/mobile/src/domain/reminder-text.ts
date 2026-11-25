import i18n from '../lib/i18n';
import type { DueReminder } from './health';

/** "#21 · Pregnancy check due" or "#21 · Due again: FMD vaccine" or a custom title. */
export function reminderText(r: DueReminder, tagOf: (id: string) => string | undefined) {
  const t = (k: string) => i18n.t(k as any) as string;
  const who = r.animalId ? `#${tagOf(r.animalId) ?? '?'} · ` : '';
  if (r.kind === 'CUSTOM') return `${who}${r.detail ?? ''}`;
  return `${who}${t(`rk_${r.kind}`)}${r.detail ? `: ${r.detail}` : ''}`;
}
