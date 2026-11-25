import i18n from '../lib/i18n';
import { formatDate, formatPKR } from '../lib/format';

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k as any, o as any) as string;

/** Look up names for ids (cow tags, customer names) when showing records. */
export interface Lookups {
  tagOf?: (id: string) => string | undefined;
  customerOf?: (id: string) => string | undefined;
  itemOf?: (id: string) => string | undefined;
  supplierOf?: (id: string) => string | undefined;
}

const ENTITY_KEYS: Record<string, string> = {
  Animal: 'animal', AnimalStatusChange: 'status', Attachment: 'photo', SyncConflict: 'conflict', MilkRecord: 'milk', MilkUsage: 'usage',
  Customer: 'customer', CustomerRate: 'rateShort', MilkDelivery: 'delivery', CustomerPayment: 'payment',
  Supplier: 'supplier', FeedItem: 'feedItem', FeedPurchase: 'purchase', SupplierPayment: 'supplierPayment', FeedConsumption: 'feeding', StockAdjustment: 'stockCount',
};
export function entityLabel(entity: string) {
  return ENTITY_KEYS[entity] ? t(ENTITY_KEYS[entity]) : entity;
}

const FIELD_KEYS: Record<string, string> = {
  tag: 'tag', name: 'name', breed: 'breed', sex: 'sex', birthDate: 'birthDate', birthDateEstimated: 'birthDateEstimated',
  purchaseDate: 'purchaseDate', purchasePricePaisa: 'purchasePrice', motherId: 'mother', photoId: 'photo', notes: 'notes',
  status: 'status', statusDate: 'statusDate', effectiveDate: 'effectiveDate', reason: 'reason', animalId: 'animal', deletedAt: 'deleted',
  date: 'date', session: 'session', quantityMl: 'quantity', note: 'notes', type: 'type',
  role: 'role', active: 'activeAccount', permissions: 'permissions', password: 'password',
  customerId: 'customer', phone: 'phone', address: 'address', defaultSaleType: 'defaultSaleType', saleType: 'saleType',
  ratePaisaPerLitre: 'rateShort', effectiveFrom: 'rateFrom', amountPaisa: 'amountShort', method: 'method', cashPaymentId: 'payment', deliveryId: 'delivery',
  feedItemId: 'feedItem', supplierId: 'supplier', category: 'category', bagWeightGrams: 'bagWeight', quantityGrams: 'kgFed', wastedGrams: 'kgWasted',
  bags: 'bagsCount', totalPaisa: 'totalAmount', costPerKgPaisa: 'avgPrice', paymentType: 'paymentType', purchaseId: 'purchase', animalIds: 'fedTo', changeGrams: 'adjustmentWillBe',
};
export function fieldLabel(_entity: string, field: string) {
  return FIELD_KEYS[field] ? t(FIELD_KEYS[field]) : field;
}

/** Show a stored value the way people read it (litres, rupees, dates, option names, names for ids). */
export function formatValue(entity: string, field: string, v: unknown, l: Lookups = {}): string {
  if (v === null || v === undefined || v === '') return t('emptyValue');
  if (typeof v === 'boolean') return v ? t('yes') : t('no');
  if (field === 'quantityMl' && typeof v === 'number') return `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} ${t('L')}`;
  if ((field === 'purchasePricePaisa' || field === 'amountPaisa') && typeof v === 'number') return formatPKR(v);
  if (['quantityGrams', 'wastedGrams', 'bagWeightGrams', 'changeGrams'].includes(field) && typeof v === 'number') return `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t('kgUnit')}`;
  if (field === 'totalPaisa' && typeof v === 'number') return formatPKR(v);
  if (field === 'costPerKgPaisa' && typeof v === 'number') return `${formatPKR(v)}/${t('kgUnit')}`;
  if (field === 'category') return t(`fc_${v}`);
  if (field === 'paymentType') return t(`st_${v}`);
  if (field === 'feedItemId' && typeof v === 'string') return l.itemOf?.(v) ?? '—';
  if (field === 'supplierId') return typeof v === 'string' ? (l.supplierOf?.(v) ?? '—') : t('noSupplier');
  if (field === 'animalIds' && Array.isArray(v)) return v.length === 1 ? (l.tagOf?.(v[0]) ? `#${l.tagOf(v[0])}` : '1') : t('animalsCount', { count: v.length });
  if (field === 'purchaseId') return '✓';
  if (field === 'ratePaisaPerLitre' && typeof v === 'number') return `${formatPKR(v)}${t('perLitre')}`;
  if (['date', 'birthDate', 'purchaseDate', 'effectiveDate', 'statusDate', 'effectiveFrom'].includes(field) && typeof v === 'string') return formatDate(v);
  if (field === 'session') return v === 'MORNING' ? t('morning') : t('evening');
  if (field === 'status' && entity !== 'SyncConflict') return t(`s_${v}`);
  if (field === 'type') return t(`u_${v}`);
  if (field === 'saleType' || field === 'defaultSaleType') return t(`st_${v}`);
  if (field === 'method') return t(`pm_${v}`);
  if (field === 'sex') return v === 'FEMALE' ? t('female') : t('male');
  if ((field === 'animalId' || field === 'motherId') && typeof v === 'string') return l.tagOf?.(v) ? `#${l.tagOf(v)}` : '—';
  if (field === 'customerId' && typeof v === 'string') return l.customerOf?.(v) ?? '—';
  if (field === 'cashPaymentId' || field === 'deliveryId') return '✓';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** A short name for a record, e.g. "#101 Rani" or "Hotel Shabbir · 24 Nov · Morning". */
export function recordTitle(entity: string, data: Record<string, any> | null | undefined, l: Lookups = {}) {
  if (!data) return '';
  const session = (s: string) => (s === 'MORNING' ? t('morning') : t('evening'));
  switch (entity) {
    case 'Animal': return `#${data.tag ?? ''}${data.name ? ` ${data.name}` : ''}`;
    case 'MilkRecord': return `#${l.tagOf?.(data.animalId) ?? ''} · ${formatDate(data.date)} · ${session(data.session)}`;
    case 'MilkUsage': return `${t(`u_${data.type}`)} · ${formatDate(data.date)}`;
    case 'Customer': return data.name ?? '';
    case 'CustomerRate': return `${l.customerOf?.(data.customerId) ?? ''} · ${formatPKR(data.ratePaisaPerLitre)}${t('perLitre')}`;
    case 'MilkDelivery': return `${l.customerOf?.(data.customerId) ?? ''} · ${formatDate(data.date)} · ${session(data.session)}`;
    case 'CustomerPayment': return `${l.customerOf?.(data.customerId) ?? ''} · ${formatPKR(data.amountPaisa)}`;
    case 'Supplier': case 'FeedItem': return data.name ?? '';
    case 'FeedPurchase': return `${l.itemOf?.(data.feedItemId) ?? ''} · ${formatDate(data.date)} · ${formatPKR(data.totalPaisa)}`;
    case 'SupplierPayment': return `${l.supplierOf?.(data.supplierId) ?? ''} · ${formatPKR(data.amountPaisa)}`;
    case 'FeedConsumption': return `${l.itemOf?.(data.feedItemId) ?? ''} · ${formatDate(data.date)}`;
    case 'StockAdjustment': return `${l.itemOf?.(data.feedItemId) ?? ''} · ${formatDate(data.date)}`;
    default: return '';
  }
}
