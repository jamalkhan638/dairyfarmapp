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
