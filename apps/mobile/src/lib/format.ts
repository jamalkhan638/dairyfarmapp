import { farmToday, paisaToRupees } from '@dairy/shared';
import i18n from './i18n';

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ur: ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
};
const lang = () => (i18n.language === 'en' ? 'en' : 'ur');

/** "24 Nov 2026" from "2026-11-24". */
export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[lang()][m - 1]} ${y}`;
}

/** Date and time in Pakistan time (UTC+5, no daylight saving) from an ISO timestamp. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const pk = new Date(new Date(iso).getTime() + 5 * 3600_000);
  const date = formatDate(pk.toISOString().slice(0, 10));
  let h = pk.getUTCHours();
  const min = String(pk.getUTCMinutes()).padStart(2, '0');
  const pm = h >= 12;
  h = h % 12 || 12;
  const suffix = lang() === 'en' ? (pm ? 'PM' : 'AM') : pm ? 'شام' : 'صبح';
  return `${date}, ${h}:${min} ${suffix}`;
}

export function formatPKR(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return '—';
  const r = paisaToRupees(paisa);
  return `Rs ${r.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

export const today = () => farmToday();
export function daysAgo(n: number) {
  const d = new Date(`${farmToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function formatAge(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = farmToday().split('-').map(Number);
  let months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 0) return null;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? i18n.t('ageYearsMonths', { y, m }) : i18n.t('ageMonths', { m });
}
