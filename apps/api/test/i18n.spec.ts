/**
 * Every text the app shows must exist in both English and Urdu.
 * Checks literal keys t('key') and prefixed keys like t(`s_${status}`) against the enum values.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as shared from '@dairy/shared';

const src = path.resolve(__dirname, '../../mobile/src');
const i18nFile = fs.readFileSync(path.join(src, 'lib/i18n.ts'), 'utf8');
const enBlock = i18nFile.slice(i18nFile.indexOf('const en = {'), i18nFile.indexOf('type Dict'));
const urBlock = i18nFile.slice(i18nFile.indexOf('const ur: Dict = {'), i18nFile.indexOf('export type TKey'));
const keysOf = (block: string) => new Set([...block.matchAll(/(?:^|[\s,{])([A-Za-z_][A-Za-z0-9_]*):\s*['"`]/g)].map((m) => m[1]));
const en = keysOf(enBlock);
const ur = keysOf(urBlock);

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(tsx?|ts)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}
const code = files(src).filter((f) => !f.endsWith('i18n.ts')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

it('English and Urdu have the same keys', () => {
  expect([...en].filter((k) => !ur.has(k))).toEqual([]);
  expect([...ur].filter((k) => !en.has(k))).toEqual([]);
  expect(en.size).toBeGreaterThan(300);
});

it('every literal key used in the app exists', () => {
  const used = new Set([...code.matchAll(/\bt\(\s*'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1]));
  // Keys passed through helpers like fieldLabel / entity maps.
  for (const m of code.matchAll(/:\s*'([a-zA-Z][A-Za-z0-9]*)'/g)) if (en.has(m[1])) used.add(m[1]);
  const missing = [...used].filter((k) => !en.has(k));
  expect(missing).toEqual([]);
});

it('every enum value has a label for each prefix the app uses', () => {
  const prefixes: Record<string, readonly string[]> = {
    s_: shared.ANIMAL_STATUSES, u_: shared.MILK_USAGE_TYPES, st_: shared.SALE_TYPES, pm_: shared.PAYMENT_METHODS, fc_: shared.FEED_CATEGORIES,
    ec_: shared.EXPENSE_CATEGORIES, ct_: shared.CAPITAL_TYPES, ht_: shared.HEALTH_TYPES, bt_: shared.BREEDING_TYPES, im_: shared.INSEMINATION_METHODS,
    pr_: shared.PREGNANCY_RESULTS, m_: shared.MODULES, ps_: ['OPEN', 'INSEMINATED', 'PREGNANT'],
    rk_: ['NEXT_DUE', 'PREGNANCY_CHECK', 'HEAT_CHECK', 'DRY_OFF', 'CALVING', 'WITHDRAWAL_END', 'CUSTOM'],
    w_: ['IN_PROGRESS', 'MILK_INCOMPLETE', 'FEED_DAYS_MISSING', 'FEED_UNPRICED', 'NO_OPENING_CASH'],
    ft_: ['one', 'milking', 'all', 'pick'], cl_: ['customer_payment', 'supplier_payment', 'market_purchase', 'expense', 'capital'],
  };
  const missing: string[] = [];
  for (const [p, values] of Object.entries(prefixes)) for (const v of values) if (!en.has(`${p}${v}`)) missing.push(`${p}${v}`);
  expect(missing).toEqual([]);
});
