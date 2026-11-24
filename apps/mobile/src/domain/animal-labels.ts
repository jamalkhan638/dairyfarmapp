import i18n from '../lib/i18n';

/** Field names shown in history and conflict screens. */
export function animalFieldLabel(f: string): string {
  const map: Record<string, string> = {
    tag: 'tag', name: 'name', breed: 'breed', sex: 'sex', birthDate: 'birthDate', birthDateEstimated: 'birthDateEstimated',
    purchaseDate: 'purchaseDate', purchasePricePaisa: 'purchasePrice', motherId: 'mother', photoId: 'photo', notes: 'notes',
    status: 'status', statusDate: 'statusDate', effectiveDate: 'effectiveDate', reason: 'reason', animalId: 'animal', deletedAt: 'deleted',
  };
  return map[f] ? i18n.t(map[f]) : f;
}
