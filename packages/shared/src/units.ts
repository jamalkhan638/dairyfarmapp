/**
 * Storage units are integers to avoid float rounding between SQLite and Postgres:
 *   money  -> paisa  (1 PKR = 100 paisa)
 *   milk   -> millilitres
 *   feed   -> grams
 */
export const rupeesToPaisa = (rupees: number) => Math.round(rupees * 100);
export const paisaToRupees = (paisa: number) => paisa / 100;
export const litresToMl = (litres: number) => Math.round(litres * 1000);
export const mlToLitres = (ml: number) => ml / 1000;
export const kgToGrams = (kg: number) => Math.round(kg * 1000);
export const gramsToKg = (g: number) => g / 1000;

/** Today's date (YYYY-MM-DD) in Pakistan time. */
export function farmToday(now: Date = new Date()): string {
  // Asia/Karachi is UTC+5 with no daylight saving.
  const pk = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return pk.toISOString().slice(0, 10);
}

/**
 * Amount for a milk sale: litres × rate, rounded to the nearest paisa.
 * The server always recalculates this; the phone uses the same formula for display.
 */
export function saleAmountPaisa(quantityMl: number, ratePaisaPerLitre: number): number {
  return Math.round((quantityMl * ratePaisaPerLitre) / 1000);
}

/** Average price per kg (in paisa) from a total amount and grams. */
export function costPerKgPaisa(totalPaisa: number, grams: number): number {
  return grams > 0 ? Math.round((totalPaisa * 1000) / grams) : 0;
}
