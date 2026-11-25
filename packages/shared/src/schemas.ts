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

// ---------- Feed & suppliers ----------
import { FEED_CATEGORIES } from './enums';

const MAX_GRAMS = 100_000_000; // 100 tonnes

export const supplierCreate = z.object({
  name: z.string().trim().min(1).max(80),
  phone: optionalText(30),
  address: optionalText(200),
  notes: optionalText(1000),
  active: z.boolean().default(true),
});
export const supplierUpdate = z.object({
  name: z.string().trim().min(1).max(80),
  phone: optionalText(30),
  address: optionalText(200),
  notes: optionalText(1000),
  active: z.boolean(),
}).partial();

export const feedItemCreate = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(FEED_CATEGORIES),
  /** Weight of one bag; null for loose feed (e.g. green fodder by the kg). */
  bagWeightGrams: z.number().int().positive().max(1_000_000).nullable().optional(),
  notes: optionalText(500),
  active: z.boolean().default(true),
});
export const feedItemUpdate = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(FEED_CATEGORIES),
  bagWeightGrams: z.number().int().positive().max(1_000_000).nullable(),
  notes: optionalText(500),
  active: z.boolean(),
}).partial();

/** Feed bought. Adds to stock; it is NOT an expense (feeding it is). */
export const feedPurchaseCreate = z.object({
  feedItemId: uuid,
  /** null = bought without a named supplier (e.g. cash at the market). */
  supplierId: uuid.nullable().optional(),
  date: isoDate,
  quantityGrams: z.number().int().positive().max(MAX_GRAMS),
  /** Number of bags, if bought by the bag (for information). */
  bags: z.number().positive().max(100_000).nullable().optional(),
  totalPaisa: z.number().int().positive().max(1_000_000_000),
  paymentType: z.enum(SALE_TYPES),
  cashPaymentId: uuid.nullable().optional(),
  note: optionalText(500),
});
export const feedPurchaseUpdate = feedPurchaseCreate.pick({ date: true, quantityGrams: true, bags: true, totalPaisa: true, note: true }).partial();

export const supplierPaymentCreate = z.object({
  supplierId: uuid,
  date: isoDate,
  amountPaisa: z.number().int().positive().max(1_000_000_000),
  method: z.enum(PAYMENT_METHODS),
  note: optionalText(500),
});
export const supplierPaymentUpdate = supplierPaymentCreate.omit({ supplierId: true }).partial();

/** Feed actually given (and wasted) on a day, to one animal or shared by a group. */
export const feedConsumptionCreate = z.object({
  feedItemId: uuid,
  date: isoDate,
  quantityGrams: z.number().int().min(0).max(MAX_GRAMS),
  wastedGrams: z.number().int().min(0).max(MAX_GRAMS).default(0),
  /** The animals that shared this feed. One animal = individual feeding. */
  animalIds: z.array(uuid).min(1).max(500),
  note: optionalText(500),
}).refine((v) => v.quantityGrams + v.wastedGrams > 0, { message: 'Enter the kg fed or wasted' });
export const feedConsumptionUpdate = z.object({
  date: isoDate,
  quantityGrams: z.number().int().min(0).max(MAX_GRAMS),
  wastedGrams: z.number().int().min(0).max(MAX_GRAMS),
  note: optionalText(500),
}).partial();

/** Correction after counting the store: + found more, − less than the app showed. */
export const stockAdjustmentCreate = z.object({
  feedItemId: uuid,
  date: isoDate,
  changeGrams: z.number().int().min(-MAX_GRAMS).max(MAX_GRAMS).refine((n) => n !== 0, 'Change cannot be 0'),
  reason: optionalText(300),
});
export const stockAdjustmentUpdate = stockAdjustmentCreate.pick({ changeGrams: true, reason: true }).partial();

// ---------- Expenses, capital, farm settings ----------
import { CAPITAL_TYPES, EXPENSE_CATEGORIES } from './enums';

export const expenseCreate = z.object({
  date: isoDate,
  category: z.enum(EXPENSE_CATEGORIES),
  amountPaisa: z.number().int().positive().max(1_000_000_000),
  description: optionalText(300),
  /** Optional: who it was bought from. Needed for credit (adds to what we owe them). */
  supplierId: uuid.nullable().optional(),
  paymentType: z.enum(SALE_TYPES).default('CASH'),
  /** How it was paid when paid now. */
  method: z.enum(PAYMENT_METHODS).default('CASH'),
  cashPaymentId: uuid.nullable().optional(),
  /** Optional: the animal it was for (e.g. vet visit). */
  animalId: uuid.nullable().optional(),
  receiptPhotoId: uuid.nullable().optional(),
});
export const expenseUpdate = z.object({
  date: isoDate,
  category: z.enum(EXPENSE_CATEGORIES),
  amountPaisa: z.number().int().positive().max(1_000_000_000),
  description: optionalText(300),
  method: z.enum(PAYMENT_METHODS),
  animalId: uuid.nullable(),
  receiptPhotoId: uuid.nullable(),
}).partial();

export const capitalEntryCreate = z.object({
  date: isoDate,
  type: z.enum(CAPITAL_TYPES),
  amountPaisa: z.number().int().positive().max(10_000_000_000),
  description: optionalText(300),
  method: z.enum(PAYMENT_METHODS).default('CASH'),
  animalId: uuid.nullable().optional(),
  receiptPhotoId: uuid.nullable().optional(),
});
export const capitalEntryUpdate = capitalEntryCreate.partial().omit({ type: true }).extend({ type: z.enum(CAPITAL_TYPES).optional() });

export const farmSettingsUpdate = z.object({
  farmName: optionalText(80),
  gestationDays: z.number().int().min(200).max(400),
  pregnancyCheckDays: z.number().int().min(20).max(150),
  heatRepeatDays: z.number().int().min(15).max(30),
  /** Money in hand when you started using the app. */
  openingCashPaisa: z.number().int().min(-10_000_000_000).max(10_000_000_000),
  openingCashDate: isoDate.nullable(),
}).partial();

// ---------- Health, breeding, reminders ----------
import { BREEDING_TYPES, HEALTH_TYPES, INSEMINATION_METHODS, PREGNANCY_RESULTS, SEXES as SEX_VALUES } from './enums';

export const healthEventCreate = z.object({
  animalId: uuid,
  date: isoDate,
  type: z.enum(HEALTH_TYPES),
  /** Illness or what was given, e.g. "Mastitis" or "FMD vaccine". */
  title: z.string().trim().min(1).max(120),
  medicine: optionalText(200),
  dose: optionalText(100),
  vetName: optionalText(80),
  /** Milk from this animal must not be sold up to and including this date (vet's instruction). */
  withdrawalEndDate: isoDate.nullable().optional(),
  /** When this should be done again (next vaccination/deworming, follow-up). */
  nextDueDate: isoDate.nullable().optional(),
  /** The expense that holds this visit's cost, if any (cost is only stored there). */
  expenseId: uuid.nullable().optional(),
  notes: optionalText(1000),
});
export const healthEventUpdate = healthEventCreate.omit({ animalId: true }).partial();

export const breedingEventCreate = z.object({
  animalId: uuid,
  date: isoDate,
  type: z.enum(BREEDING_TYPES),
  method: z.enum(INSEMINATION_METHODS).nullable().optional(),
  /** Semen straw / bull name. */
  sire: optionalText(120),
  technician: optionalText(80),
  result: z.enum(PREGNANCY_RESULTS).nullable().optional(),
  /** Calving: the calf, if it was added as an animal. */
  calfId: uuid.nullable().optional(),
  calfSex: z.enum(SEX_VALUES).nullable().optional(),
  notes: optionalText(1000),
});
export const breedingEventUpdate = breedingEventCreate.omit({ animalId: true, type: true }).partial();

/** A reminder the user added, or a dismissal of an automatic reminder (sourceKey). */
export const reminderCreate = z.object({
  animalId: uuid.nullable().optional(),
  dueDate: isoDate,
  title: z.string().trim().min(1).max(200),
  /** Set when this marks an automatic reminder as done (e.g. "pcheck:<event id>"). */
  sourceKey: z.string().max(80).nullable().optional(),
  done: z.boolean().default(false),
  notes: optionalText(500),
});
export const reminderUpdate = reminderCreate.omit({ sourceKey: true }).partial();
