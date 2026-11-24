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
