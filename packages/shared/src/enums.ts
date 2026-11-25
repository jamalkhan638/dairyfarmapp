export const ANIMAL_STATUSES = ['MILKING', 'DRY', 'YOUNG', 'SOLD', 'DECEASED'] as const;
export type AnimalStatus = (typeof ANIMAL_STATUSES)[number];
/** Statuses that mean the animal is still on the farm. */
export const ACTIVE_STATUSES: AnimalStatus[] = ['MILKING', 'DRY', 'YOUNG'];

export const SEXES = ['FEMALE', 'MALE'] as const;
export type Sex = (typeof SEXES)[number];

export const LANGUAGES = ['ur', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** All farm dates are calendar days in Pakistan time. */
export const FARM_TIMEZONE = 'Asia/Karachi';

export const MILK_SESSIONS = ['MORNING', 'EVENING'] as const;
export type MilkSession = (typeof MILK_SESSIONS)[number];

/** Milk not sold. "Sold" comes from customer deliveries (Sales module). */
export const MILK_USAGE_TYPES = ['CALF_FED', 'HOME', 'DISCARDED'] as const;
export type MilkUsageType = (typeof MILK_USAGE_TYPES)[number];

/** Most a cow can give in one milking (ml). Higher values are typing mistakes. */
export const MAX_MILK_PER_SESSION_ML = 60_000;

export const SALE_TYPES = ['CASH', 'CREDIT'] as const;
export type SaleType = (typeof SALE_TYPES)[number];

export const PAYMENT_METHODS = ['CASH', 'BANK', 'MOBILE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const FEED_CATEGORIES = ['CONCENTRATE', 'GREEN_FODDER', 'SILAGE', 'MINERAL', 'OTHER'] as const;
export type FeedCategory = (typeof FEED_CATEGORIES)[number];

/** Daily running costs (count towards operating profit). */
export const EXPENSE_CATEGORIES = ['VET', 'MEDICINE', 'LABOUR', 'ELECTRICITY', 'TRANSPORT', 'REPAIRS', 'OTHER'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Money that is not a daily running cost: kept out of operating profit. */
export const CAPITAL_TYPES = ['ANIMAL_PURCHASE', 'EQUIPMENT', 'OWNER_INVESTMENT', 'OWNER_WITHDRAWAL', 'ANIMAL_SALE'] as const;
export type CapitalType = (typeof CAPITAL_TYPES)[number];
/** Capital entries that bring money in; the rest take money out. */
export const CAPITAL_IN: CapitalType[] = ['OWNER_INVESTMENT', 'ANIMAL_SALE'];

/** The farm settings record has one fixed id. */
export const FARM_SETTINGS_ID = '00000000-0000-4000-8000-000000000001';
