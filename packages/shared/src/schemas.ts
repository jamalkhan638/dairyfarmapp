import { z } from 'zod';
import { ANIMAL_STATUSES, SEXES } from './enums';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
export const uuid = z.uuid();
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/**
 * Animal fields a user may set. Status is NOT here: it only changes through
 * AnimalStatusChange records so the status history stays complete.
 */
export const animalFields = z.object({
  tag: z.string().trim().min(1).max(40),
  name: optionalText(80),
  breed: optionalText(80),
  sex: z.enum(SEXES),
  birthDate: isoDate.nullable().optional(),
  birthDateEstimated: z.boolean(),
  purchaseDate: isoDate.nullable().optional(),
  purchasePricePaisa: z.number().int().nonnegative().nullable().optional(),
  motherId: uuid.nullable().optional(),
  photoId: uuid.nullable().optional(),
  notes: optionalText(1000),
});
// Note: no .default() in field schemas, so a partial update never fills in defaults.
export const animalCreate = animalFields.extend({
  sex: z.enum(SEXES).default('FEMALE'),
  birthDateEstimated: z.boolean().default(false),
  /** Starting status, recorded as the first status change (with this id). */
  initialStatusChangeId: uuid,
  initialStatus: z.enum(ANIMAL_STATUSES).default('MILKING'),
  initialStatusDate: isoDate,
});
export const animalUpdate = animalFields.partial();
export type AnimalCreate = z.infer<typeof animalCreate>;
export type AnimalUpdate = z.infer<typeof animalUpdate>;

export const statusChangeFields = z.object({
  animalId: uuid,
  status: z.enum(ANIMAL_STATUSES),
  effectiveDate: isoDate,
  reason: optionalText(500),
});
export const statusChangeCreate = statusChangeFields;
export const statusChangeUpdate = statusChangeFields.omit({ animalId: true }).partial();

export const attachmentFields = z.object({
  entity: z.string().min(1).max(40),
  recordId: uuid,
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
});
export const attachmentCreate = attachmentFields;
export const attachmentUpdate = z.object({}).strict();

// ---------- Milk ----------
import { MAX_MILK_PER_SESSION_ML, MILK_SESSIONS, MILK_USAGE_TYPES } from './enums';

/** One cow, one date, one session. 0 is a real recorded value; a missing record means "not recorded". */
export const milkRecordCreate = z.object({
  animalId: uuid,
  date: isoDate,
  session: z.enum(MILK_SESSIONS),
  quantityMl: z.number().int().min(0).max(MAX_MILK_PER_SESSION_ML),
  note: optionalText(500),
});
/** Cow, date and session are the record's identity; to move an entry, delete it and add it again. */
export const milkRecordUpdate = milkRecordCreate.pick({ quantityMl: true, note: true }).partial();

export const milkUsageCreate = z.object({
  date: isoDate,
  type: z.enum(MILK_USAGE_TYPES),
  quantityMl: z.number().int().positive().max(1_000_000),
  /** Optional: which cow's milk was discarded, or which calf was fed. */
  animalId: uuid.nullable().optional(),
  note: optionalText(500),
});
export const milkUsageUpdate = milkUsageCreate.partial();

// ---------- Sales ----------
import { PAYMENT_METHODS, SALE_TYPES } from './enums';

const MAX_RATE_PAISA = 100_000; // Rs 1,000 per litre: anything above is a typing mistake
const MAX_AMOUNT_PAISA = 1_000_000_000; // Rs 1 crore

export const customerCreate = z.object({
  name: z.string().trim().min(1).max(80),
  phone: optionalText(30),
  address: optionalText(200),
  notes: optionalText(1000),
  /** Usual way this customer pays; pre-selected when recording deliveries. */
  defaultSaleType: z.enum(SALE_TYPES).default('CREDIT'),
  active: z.boolean().default(true),
});
export const customerUpdate = z.object({
  name: z.string().trim().min(1).max(80),
  phone: optionalText(30),
  address: optionalText(200),
  notes: optionalText(1000),
  defaultSaleType: z.enum(SALE_TYPES),
  active: z.boolean(),
}).partial();

/** A customer's price per litre from a date onwards. Earlier deliveries keep their own rate. */
export const customerRateCreate = z.object({
  customerId: uuid,
  ratePaisaPerLitre: z.number().int().positive().max(MAX_RATE_PAISA),
  effectiveFrom: isoDate,
  note: optionalText(300),
});
export const customerRateUpdate = customerRateCreate.pick({ ratePaisaPerLitre: true, note: true }).partial();

export const milkDeliveryCreate = z.object({
  customerId: uuid,
  date: isoDate,
  session: z.enum(MILK_SESSIONS),
  quantityMl: z.number().int().positive().max(1_000_000),
  /** Copied from the customer's rate at the time; can be changed for this one delivery. */
  ratePaisaPerLitre: z.number().int().min(0).max(MAX_RATE_PAISA),
  saleType: z.enum(SALE_TYPES),
  /** For cash sales: id for the payment record the server creates alongside the delivery. */
  cashPaymentId: uuid.nullable().optional(),
  note: optionalText(500),
});
/** Customer, date, milking and cash/credit are fixed; to change them, delete and add again. */
export const milkDeliveryUpdate = milkDeliveryCreate.pick({ quantityMl: true, ratePaisaPerLitre: true, note: true }).partial();

export const customerPaymentCreate = z.object({
  customerId: uuid,
  date: isoDate,
  amountPaisa: z.number().int().positive().max(MAX_AMOUNT_PAISA),
  method: z.enum(PAYMENT_METHODS),
  note: optionalText(500),
});
export const customerPaymentUpdate = customerPaymentCreate.omit({ customerId: true }).partial();
